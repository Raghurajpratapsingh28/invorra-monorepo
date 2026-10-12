import { z } from 'zod';
import {
  cols,
  contains,
  countDocs,
  equalsIgnoreCase,
  findMany,
  findOne,
  insertOne,
  patchMany,
  removeMany,
  withTransaction,
} from '../../db/mongo';
import type { WarehouseDoc } from '../../domain/documents';
import { AuditAction, recordAudit } from '../../lib/audit';
import { conflict, notFound } from '../../utils/errors';
import { toPagination, toSkip } from '../../utils/pagination';
import type { createWarehouseSchema, listWarehousesSchema, updateWarehouseSchema } from './warehouses.schema';

type ListQuery = z.infer<typeof listWarehousesSchema>['query'];
type CreateBody = z.infer<typeof createWarehouseSchema>['body'];
type UpdateBody = z.infer<typeof updateWarehouseSchema>['body'];

export function toWarehouse(warehouse: WarehouseDoc) {
  return {
    id: warehouse.id,
    organizationId: warehouse.organizationId,
    name: warehouse.name,
    code: warehouse.code,
    city: warehouse.city,
    state: warehouse.state,
    address: warehouse.address,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.updatedAt,
  };
}

export async function listWarehouses(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.city ? { city: equalsIgnoreCase(query.city) } : {}),
    ...(query.search
      ? { $or: [{ name: contains(query.search) }, { code: contains(query.search) }, { city: contains(query.search) }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.warehouses, filter),
    findMany<WarehouseDoc>(cols.warehouses, filter, {
      sort: { city: 1, name: 1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }),
  ]);
  return { items: rows.map(toWarehouse), pagination: toPagination(query.page, query.limit, total) };
}

export async function getWarehouse(organizationId: string, id: string) {
  const warehouse = await findOne<WarehouseDoc>(cols.warehouses, { _id: id, organizationId });
  if (!warehouse) {
    throw notFound('Warehouse not found');
  }
  return toWarehouse(warehouse);
}

export async function createWarehouse(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await findOne<WarehouseDoc>(cols.warehouses, { organizationId, code: input.code });
  if (duplicate) {
    throw conflict('WAREHOUSE_CODE_CONFLICT', 'Warehouse code already exists in this organization');
  }
  const warehouse = await withTransaction(async () => {
    const created = await insertOne<WarehouseDoc>(cols.warehouses, {
      organizationId,
      name: input.name,
      code: input.code,
      city: input.city,
      state: input.state ?? null,
      address: input.address ?? null,
    });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.WAREHOUSE_CREATED,
      entityType: 'Warehouse',
      entityId: created.id,
      metadata: { code: created.code, city: created.city },
    });
    return created;
  });
  return toWarehouse(warehouse);
}

export async function updateWarehouse(organizationId: string, userId: string, id: string, input: UpdateBody) {
  const existing = await findOne<WarehouseDoc>(cols.warehouses, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Warehouse not found');
  }
  if (input.code && input.code !== existing.code) {
    const duplicate = await findOne<WarehouseDoc>(cols.warehouses, {
      organizationId,
      code: input.code,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw conflict('WAREHOUSE_CODE_CONFLICT', 'Warehouse code already exists in this organization');
    }
  }
  const warehouse = await withTransaction(async () => {
    const updated = await patchMany(cols.warehouses, { _id: id, organizationId }, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
    });
    if (updated === 0) {
      throw notFound('Warehouse not found');
    }
    const fresh = await findOne<WarehouseDoc>(cols.warehouses, { _id: id, organizationId });
    if (!fresh) {
      throw notFound('Warehouse not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.WAREHOUSE_UPDATED,
      entityType: 'Warehouse',
      entityId: id,
      metadata: { code: fresh.code },
    });
    return fresh;
  });
  return toWarehouse(warehouse);
}

export async function deleteWarehouse(organizationId: string, userId: string, id: string) {
  const existing = await findOne<WarehouseDoc>(cols.warehouses, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Warehouse not found');
  }
  const [sales, purchaseOrders] = await Promise.all([
    countDocs(cols.sales, { organizationId, warehouseId: id }),
    countDocs(cols.purchaseOrders, { organizationId, warehouseId: id }),
  ]);
  if (sales > 0 || purchaseOrders > 0) {
    throw conflict('WAREHOUSE_IN_USE', 'Cannot delete a warehouse with sales or purchase order history.');
  }
  await withTransaction(async () => {
    const deleted = await removeMany(cols.warehouses, { _id: id, organizationId });
    if (deleted === 0) {
      throw notFound('Warehouse not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.WAREHOUSE_DELETED,
      entityType: 'Warehouse',
      entityId: id,
      metadata: { code: existing.code },
    });
  });
  return { id, deleted: true as const };
}
