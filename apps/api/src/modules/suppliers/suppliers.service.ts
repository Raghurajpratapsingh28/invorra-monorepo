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
import type { SupplierDoc } from '../../domain/documents';
import { AuditAction, recordAudit } from '../../lib/audit';
import { conflict, notFound } from '../../utils/errors';
import { toPagination, toSkip } from '../../utils/pagination';
import type { createSupplierSchema, listSuppliersSchema, updateSupplierSchema } from './suppliers.schema';

type ListQuery = z.infer<typeof listSuppliersSchema>['query'];
type CreateBody = z.infer<typeof createSupplierSchema>['body'];
type UpdateBody = z.infer<typeof updateSupplierSchema>['body'];

export function toSupplier(supplier: SupplierDoc) {
  return {
    id: supplier.id,
    organizationId: supplier.organizationId,
    name: supplier.name,
    code: supplier.code,
    email: supplier.email,
    phone: supplier.phone,
    city: supplier.city,
    leadTimeDays: supplier.leadTimeDays,
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt,
  };
}

export async function listSuppliers(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.city ? { city: equalsIgnoreCase(query.city) } : {}),
    ...(query.search ? { $or: [{ name: contains(query.search) }, { code: contains(query.search) }] } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.suppliers, filter),
    findMany<SupplierDoc>(cols.suppliers, filter, {
      sort: { name: 1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }),
  ]);
  return { items: rows.map(toSupplier), pagination: toPagination(query.page, query.limit, total) };
}

export async function getSupplier(organizationId: string, id: string) {
  const supplier = await findOne<SupplierDoc>(cols.suppliers, { _id: id, organizationId });
  if (!supplier) {
    throw notFound('Supplier not found');
  }
  return toSupplier(supplier);
}

export async function createSupplier(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await findOne<SupplierDoc>(cols.suppliers, { organizationId, code: input.code });
  if (duplicate) {
    throw conflict('SUPPLIER_CODE_CONFLICT', 'Supplier code already exists in this organization');
  }
  const supplier = await withTransaction(async () => {
    const created = await insertOne<SupplierDoc>(cols.suppliers, {
      organizationId,
      name: input.name,
      code: input.code,
      email: input.email ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      leadTimeDays: input.leadTimeDays ?? 5,
    });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.SUPPLIER_CREATED,
      entityType: 'Supplier',
      entityId: created.id,
      metadata: { code: created.code },
    });
    return created;
  });
  return toSupplier(supplier);
}

export async function updateSupplier(organizationId: string, userId: string, id: string, input: UpdateBody) {
  const existing = await findOne<SupplierDoc>(cols.suppliers, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Supplier not found');
  }
  if (input.code && input.code !== existing.code) {
    const duplicate = await findOne<SupplierDoc>(cols.suppliers, {
      organizationId,
      code: input.code,
      _id: { $ne: id },
    });
    if (duplicate) {
      throw conflict('SUPPLIER_CODE_CONFLICT', 'Supplier code already exists in this organization');
    }
  }
  const supplier = await withTransaction(async () => {
    const updated = await patchMany(cols.suppliers, { _id: id, organizationId }, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
    });
    if (updated === 0) {
      throw notFound('Supplier not found');
    }
    const fresh = await findOne<SupplierDoc>(cols.suppliers, { _id: id, organizationId });
    if (!fresh) {
      throw notFound('Supplier not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.SUPPLIER_UPDATED,
      entityType: 'Supplier',
      entityId: id,
      metadata: { code: fresh.code },
    });
    return fresh;
  });
  return toSupplier(supplier);
}

export async function deleteSupplier(organizationId: string, userId: string, id: string) {
  const existing = await findOne<SupplierDoc>(cols.suppliers, { _id: id, organizationId });
  if (!existing) {
    throw notFound('Supplier not found');
  }
  const purchaseOrders = await countDocs(cols.purchaseOrders, { organizationId, supplierId: id });
  if (purchaseOrders > 0) {
    throw conflict('SUPPLIER_IN_USE', 'Cannot delete a supplier that has purchase orders.');
  }
  await withTransaction(async () => {
    const deleted = await removeMany(cols.suppliers, { _id: id, organizationId });
    if (deleted === 0) {
      throw notFound('Supplier not found');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.SUPPLIER_DELETED,
      entityType: 'Supplier',
      entityId: id,
      metadata: { code: existing.code },
    });
  });
  return { id, deleted: true as const };
}
