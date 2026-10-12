import type { z } from 'zod';
import { cols, contains, countDocs, findMany, findOne, insertOne, patchMany, removeMany, withTransaction } from '../../db/mongo';
import type { ProductDoc } from '../../domain/documents';
import { AuditAction, recordAudit } from '../../lib/audit';
import { conflict, notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import type { createProductSchema, listProductsSchema, updateProductSchema } from './products.schema';

type ListQuery = z.infer<typeof listProductsSchema>['query'];
type CreateBody = z.infer<typeof createProductSchema>['body'];
type UpdateBody = z.infer<typeof updateProductSchema>['body'];

export function toProduct(product: ProductDoc) {
  return {
    id: product.id,
    organizationId: product.organizationId,
    sku: product.sku,
    name: product.name,
    category: product.category,
    brand: product.brand,
    unit: product.unit,
    unitCost: decimalToString(product.unitCost),
    sellingPrice: decimalToString(product.sellingPrice),
    status: product.status,
    leadTimeDays: product.leadTimeDays,
    reorderPoint: product.reorderPoint,
    safetyStock: product.safetyStock,
    moq: product.moq,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function listProducts(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search ? { $or: [{ name: contains(query.search) }, { sku: contains(query.search) }] } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.products, filter),
    findMany<ProductDoc>(cols.products, filter, {
      sort: { name: 1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }),
  ]);
  return { items: rows.map(toProduct), pagination: toPagination(query.page, query.limit, total) };
}

export async function getProduct(organizationId: string, id: string) {
  const product = await findOne<ProductDoc>(cols.products, { _id: id, organizationId });
  if (!product) {
    throw notFound('Product not found');
  }
  return toProduct(product);
}

export async function createProduct(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await findOne<ProductDoc>(cols.products, { organizationId, sku: input.sku });
  if (duplicate) {
    throw conflict('SKU_CONFLICT', 'SKU already exists in this organization');
  }

  const product = await withTransaction(async () => {
    const created = await insertOne<ProductDoc>(cols.products, {
      organizationId,
      sku: input.sku,
      name: input.name,
      category: input.category ?? null,
      brand: input.brand ?? null,
      unit: input.unit ?? 'pcs',
      unitCost: input.unitCost,
      sellingPrice: input.sellingPrice,
      status: input.status ?? 'ACTIVE',
      leadTimeDays: input.leadTimeDays ?? 5,
      reorderPoint: input.reorderPoint ?? 0,
      safetyStock: input.safetyStock ?? 0,
      moq: input.moq ?? 1,
    });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.PRODUCT_CREATED,
      entityType: 'Product',
      entityId: created.id,
      metadata: { sku: created.sku, name: created.name },
    });
    return created;
  });
  return toProduct(product);
}

export async function updateProduct(organizationId: string, userId: string, id: string, input: UpdateBody) {
  const existing = await findOne<ProductDoc>(cols.products, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Product not found');
  }
  if (input.sku && input.sku !== existing.sku) {
    const duplicate = await findOne<ProductDoc>(cols.products, {
      organizationId,
      sku: input.sku,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw conflict('SKU_CONFLICT', 'SKU already exists in this organization');
    }
  }

  const product = await withTransaction(async () => {
    const updated = await patchMany(cols.products, { _id: id, organizationId }, {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.brand !== undefined ? { brand: input.brand } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.unitCost !== undefined ? { unitCost: input.unitCost } : {}),
      ...(input.sellingPrice !== undefined ? { sellingPrice: input.sellingPrice } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
      ...(input.reorderPoint !== undefined ? { reorderPoint: input.reorderPoint } : {}),
      ...(input.safetyStock !== undefined ? { safetyStock: input.safetyStock } : {}),
      ...(input.moq !== undefined ? { moq: input.moq } : {}),
    });
    if (updated === 0) {
      throw notFound('Product not found');
    }
    const fresh = await findOne<ProductDoc>(cols.products, { _id: id, organizationId });
    if (!fresh) {
      throw notFound('Product not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.PRODUCT_UPDATED,
      entityType: 'Product',
      entityId: id,
      metadata: { sku: fresh.sku },
    });
    return fresh;
  });
  return toProduct(product);
}

export async function deleteProduct(organizationId: string, userId: string, id: string) {
  const existing = await findOne<ProductDoc>(cols.products, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Product not found');
  }
  const [sales, poItems] = await Promise.all([
    countDocs(cols.sales, { organizationId, productId: id }),
    countDocs(cols.purchaseOrders, { organizationId, 'items.productId': id }),
  ]);
  if (sales > 0 || poItems > 0) {
    throw conflict(
      'PRODUCT_IN_USE',
      'Cannot delete a product with sales or purchase order history. Deactivate it instead.',
    );
  }
  await withTransaction(async () => {
    const deleted = await removeMany(cols.products, { _id: id, organizationId });
    if (deleted === 0) {
      throw notFound('Product not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.PRODUCT_DELETED,
      entityType: 'Product',
      entityId: id,
      metadata: { sku: existing.sku },
    });
  });
  return { id, deleted: true as const };
}
