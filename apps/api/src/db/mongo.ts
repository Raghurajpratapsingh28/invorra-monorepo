import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { MongoClient, type ClientSession, type Collection, type Filter, type Sort } from 'mongodb';
import { env } from '../config/env';

/** Application documents use string ids so filters are not locked to ObjectId. */
export interface AppDocument {
  _id: string;
  [key: string]: unknown;
}

const sessions = new AsyncLocalStorage<ClientSession>();
let client: MongoClient | null = null;
let databaseReady: Promise<void> | null = null;

export function newId(): string {
  return randomUUID();
}

function sessionOptions(): { session?: ClientSession } {
  const session = sessions.getStore();
  return session ? { session } : {};
}

export async function connectMongo(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
  }
  if (!databaseReady) {
    const active = client;
    databaseReady = active.connect().then(async () => {
      await ensureIndexes(active);
    });
  }
  await databaseReady;
  return client;
}

export async function disconnectMongo(): Promise<void> {
  databaseReady = null;
  if (client) {
    await client.close();
    client = null;
  }
}

export async function pingMongo(): Promise<void> {
  const active = await connectMongo();
  await active.db().command({ ping: 1 }, sessionOptions());
}

async function collection(name: string): Promise<Collection<AppDocument>> {
  const active = await connectMongo();
  return active.db().collection<AppDocument>(name);
}

function dbCollection(active: MongoClient, name: string): Collection<AppDocument> {
  return active.db().collection<AppDocument>(name);
}

export const cols = {
  organizations: () => collection('organizations'),
  users: () => collection('users'),
  products: () => collection('products'),
  warehouses: () => collection('warehouses'),
  suppliers: () => collection('suppliers'),
  inventory: () => collection('inventory'),
  sales: () => collection('sales'),
  forecasts: () => collection('forecasts'),
  recommendations: () => collection('recommendations'),
  purchaseOrders: () => collection('purchaseOrders'),
  auditLogs: () => collection('auditLogs'),
};

export function fromStored<T extends { id: string }>(row: AppDocument): T {
  const { _id, ...rest } = row;
  return { ...rest, id: String(_id) } as T;
}

export async function findOne<T extends { id: string }>(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
): Promise<T | null> {
  const row = await (await name()).findOne(filter, sessionOptions());
  return row ? fromStored<T>(row) : null;
}

export async function findMany<T extends { id: string }>(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
  options: { sort?: Sort; skip?: number; limit?: number } = {},
): Promise<T[]> {
  let cursor = (await name()).find(filter, sessionOptions());
  if (options.sort) {
    cursor = cursor.sort(options.sort);
  }
  if (options.skip) {
    cursor = cursor.skip(options.skip);
  }
  if (options.limit) {
    cursor = cursor.limit(options.limit);
  }
  const rows = await cursor.toArray();
  return rows.map((row) => fromStored<T>(row));
}

export async function countDocs(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
): Promise<number> {
  return (await name()).countDocuments(filter, sessionOptions());
}

export async function insertOne<T extends { id: string }>(
  name: () => Promise<Collection<AppDocument>>,
  input: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: Date;
    updatedAt?: Date;
  },
): Promise<T> {
  const now = new Date();
  const id = input.id ?? newId();
  const createdAt = input.createdAt ?? now;
  const updatedAt = input.updatedAt ?? now;
  const fields = { ...input };
  delete fields.id;
  const stored = { ...fields, _id: id, createdAt, updatedAt } as AppDocument;
  await (await name()).insertOne(stored, sessionOptions());
  return fromStored<T>(stored);
}

export async function insertMany<T extends { id: string }>(
  name: () => Promise<Collection<AppDocument>>,
  inputs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: Date; updatedAt?: Date }>,
): Promise<void> {
  if (inputs.length === 0) {
    return;
  }
  const now = new Date();
  const docs = inputs.map((input) => {
    const id = input.id ?? newId();
    const fields = { ...input };
    delete fields.id;
    return { ...fields, _id: id, createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now } as AppDocument;
  });
  await (await name()).insertMany(docs, { ...sessionOptions(), ordered: false });
}

export async function patchOne(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
  set: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const result = await (await name()).updateOne(
    filter,
    { $set: { ...set, updatedAt: new Date() }, ...extra },
    sessionOptions(),
  );
  return result.matchedCount;
}

export async function patchMany(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
  set: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const result = await (await name()).updateMany(
    filter,
    { $set: { ...set, updatedAt: new Date() }, ...extra },
    sessionOptions(),
  );
  return result.matchedCount;
}

export async function removeMany(
  name: () => Promise<Collection<AppDocument>>,
  filter: Filter<AppDocument>,
): Promise<number> {
  const result = await (await name()).deleteMany(filter, sessionOptions());
  return result.deletedCount;
}

export async function mapByIds<T extends { id: string }>(
  name: () => Promise<Collection<AppDocument>>,
  ids: string[],
): Promise<Map<string, T>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await findMany<T>(name, { _id: { $in: unique } });
  return new Map(rows.map((row) => [row.id, row]));
}

export function contains(value: string) {
  return { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
}

export function equalsIgnoreCase(value: string) {
  return { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
}

export async function withTransaction<T>(work: () => Promise<T>): Promise<T> {
  const active = await connectMongo();
  const session = active.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await sessions.run(session, work);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function aggregate<T>(
  name: () => Promise<Collection<AppDocument>>,
  pipeline: Record<string, unknown>[],
): Promise<T[]> {
  const rows = await (await name()).aggregate(pipeline, sessionOptions()).toArray();
  return rows as T[];
}

async function ensureIndexes(active: MongoClient): Promise<void> {
  const organizations = dbCollection(active, 'organizations');
  const users = dbCollection(active, 'users');
  const products = dbCollection(active, 'products');
  const warehouses = dbCollection(active, 'warehouses');
  const suppliers = dbCollection(active, 'suppliers');
  const inventory = dbCollection(active, 'inventory');
  const sales = dbCollection(active, 'sales');
  const forecasts = dbCollection(active, 'forecasts');
  const recommendations = dbCollection(active, 'recommendations');
  const purchaseOrders = dbCollection(active, 'purchaseOrders');
  const auditLogs = dbCollection(active, 'auditLogs');

  await Promise.all([
    organizations.createIndex({ slug: 1 }, { unique: true }),
    users.createIndex({ email: 1 }, { unique: true }),
    users.createIndex({ organizationId: 1 }),
    products.createIndex({ organizationId: 1, sku: 1 }, { unique: true }),
    products.createIndex({ organizationId: 1, status: 1 }),
    warehouses.createIndex({ organizationId: 1, code: 1 }, { unique: true }),
    warehouses.createIndex({ city: 1 }),
    suppliers.createIndex({ organizationId: 1, code: 1 }, { unique: true }),
    inventory.createIndex({ productId: 1, warehouseId: 1 }, { unique: true }),
    inventory.createIndex({ organizationId: 1, productId: 1, warehouseId: 1 }),
    sales.createIndex({ organizationId: 1, soldAt: 1 }),
    sales.createIndex({ organizationId: 1, productId: 1, warehouseId: 1, soldAt: 1 }),
    forecasts.createIndex(
      { organizationId: 1, productId: 1, warehouseId: 1, forecastDate: 1, modelVersion: 1 },
      { unique: true },
    ),
    forecasts.createIndex({ organizationId: 1, forecastDate: 1 }),
    recommendations.createIndex({ organizationId: 1, status: 1 }),
    purchaseOrders.createIndex({ organizationId: 1, poNumber: 1 }, { unique: true }),
    purchaseOrders.createIndex(
      { recommendationId: 1 },
      { unique: true, partialFilterExpression: { recommendationId: { $type: 'string' } } },
    ),
    purchaseOrders.createIndex({ organizationId: 1, status: 1 }),
    purchaseOrders.createIndex({ 'items.productId': 1 }),
    auditLogs.createIndex({ organizationId: 1, createdAt: -1 }),
    auditLogs.createIndex({ entityType: 1, entityId: 1 }),
  ]);
}
