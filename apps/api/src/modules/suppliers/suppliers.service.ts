import { Prisma, Supplier } from '@prisma/client';
import { z } from 'zod';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../utils/errors';
import { toPagination, toSkip } from '../../utils/pagination';
import type {
  createSupplierSchema,
  listSuppliersSchema,
  updateSupplierSchema,
} from './suppliers.schema';

type ListQuery = z.infer<typeof listSuppliersSchema>['query'];
type CreateBody = z.infer<typeof createSupplierSchema>['body'];
type UpdateBody = z.infer<typeof updateSupplierSchema>['body'];

export function toSupplier(supplier: Supplier) {
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
  const where: Prisma.SupplierWhereInput = {
    organizationId,
    ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toSupplier),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function getSupplier(organizationId: string, id: string) {
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!supplier) {
    throw notFound('Supplier not found');
  }
  return toSupplier(supplier);
}

export async function createSupplier(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await prisma.supplier.findFirst({
    where: { organizationId, code: input.code },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('SUPPLIER_CODE_CONFLICT', 'Supplier code already exists in this organization');
  }

  const supplier = await prisma.$transaction(async (tx) => {
    const created = await tx.supplier.create({
      data: {
        organizationId,
        name: input.name,
        code: input.code,
        email: input.email ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        leadTimeDays: input.leadTimeDays ?? 5,
      },
    });
    await recordAudit(tx, {
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

export async function updateSupplier(
  organizationId: string,
  userId: string,
  id: string,
  input: UpdateBody,
) {
  const existing = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Supplier not found');
  }

  if (input.code && input.code !== existing.code) {
    const duplicate = await prisma.supplier.findFirst({
      where: { organizationId, code: input.code, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('SUPPLIER_CODE_CONFLICT', 'Supplier code already exists in this organization');
    }
  }

  const supplier = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.updateMany({
      where: { id, organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.leadTimeDays !== undefined ? { leadTimeDays: input.leadTimeDays } : {}),
      },
    });
    if (updated.count === 0) {
      throw notFound('Supplier not found');
    }
    const fresh = await tx.supplier.findFirst({ where: { id, organizationId } });
    if (!fresh) {
      throw notFound('Supplier not found');
    }
    await recordAudit(tx, {
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
  const existing = await prisma.supplier.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Supplier not found');
  }

  const purchaseOrders = await prisma.purchaseOrder.count({
    where: { organizationId, supplierId: id },
  });
  if (purchaseOrders > 0) {
    throw conflict('SUPPLIER_IN_USE', 'Cannot delete a supplier that has purchase orders.');
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.supplier.deleteMany({ where: { id, organizationId } });
    if (deleted.count === 0) {
      throw notFound('Supplier not found');
    }
    await recordAudit(tx, {
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
