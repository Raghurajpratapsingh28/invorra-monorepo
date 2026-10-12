import { Prisma, Warehouse } from '@prisma/client';
import { z } from 'zod';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../utils/errors';
import { toPagination, toSkip } from '../../utils/pagination';
import type {
  createWarehouseSchema,
  listWarehousesSchema,
  updateWarehouseSchema,
} from './warehouses.schema';

type ListQuery = z.infer<typeof listWarehousesSchema>['query'];
type CreateBody = z.infer<typeof createWarehouseSchema>['body'];
type UpdateBody = z.infer<typeof updateWarehouseSchema>['body'];

export function toWarehouse(warehouse: Warehouse) {
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
  const where: Prisma.WarehouseWhereInput = {
    organizationId,
    ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { code: { contains: query.search, mode: 'insensitive' } },
            { city: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.warehouse.count({ where }),
    prisma.warehouse.findMany({
      where,
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toWarehouse),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function getWarehouse(organizationId: string, id: string) {
  const warehouse = await prisma.warehouse.findFirst({ where: { id, organizationId } });
  if (!warehouse) {
    throw notFound('Warehouse not found');
  }
  return toWarehouse(warehouse);
}

export async function createWarehouse(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await prisma.warehouse.findFirst({
    where: { organizationId, code: input.code },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('WAREHOUSE_CODE_CONFLICT', 'Warehouse code already exists in this organization');
  }

  const warehouse = await prisma.$transaction(async (tx) => {
    const created = await tx.warehouse.create({
      data: {
        organizationId,
        name: input.name,
        code: input.code,
        city: input.city,
        state: input.state ?? null,
        address: input.address ?? null,
      },
    });
    await recordAudit(tx, {
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

export async function updateWarehouse(
  organizationId: string,
  userId: string,
  id: string,
  input: UpdateBody,
) {
  const existing = await prisma.warehouse.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Warehouse not found');
  }

  if (input.code && input.code !== existing.code) {
    const duplicate = await prisma.warehouse.findFirst({
      where: { organizationId, code: input.code, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('WAREHOUSE_CODE_CONFLICT', 'Warehouse code already exists in this organization');
    }
  }

  const warehouse = await prisma.$transaction(async (tx) => {
    const updated = await tx.warehouse.updateMany({
      where: { id, organizationId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
      },
    });
    if (updated.count === 0) {
      throw notFound('Warehouse not found');
    }
    const fresh = await tx.warehouse.findFirst({ where: { id, organizationId } });
    if (!fresh) {
      throw notFound('Warehouse not found');
    }
    await recordAudit(tx, {
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
  const existing = await prisma.warehouse.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Warehouse not found');
  }

  const [sales, purchaseOrders] = await Promise.all([
    prisma.sale.count({ where: { organizationId, warehouseId: id } }),
    prisma.purchaseOrder.count({ where: { organizationId, warehouseId: id } }),
  ]);

  if (sales > 0 || purchaseOrders > 0) {
    throw conflict(
      'WAREHOUSE_IN_USE',
      'Cannot delete a warehouse with sales or purchase order history.',
    );
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.warehouse.deleteMany({ where: { id, organizationId } });
    if (deleted.count === 0) {
      throw notFound('Warehouse not found');
    }
    await recordAudit(tx, {
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
