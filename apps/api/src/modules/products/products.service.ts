import { Prisma, Product } from '@prisma/client';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { conflict, notFound } from '../../utils/errors';
import type { z } from 'zod';
import type { createProductSchema, listProductsSchema, updateProductSchema } from './products.schema';

type ListQuery = z.infer<typeof listProductsSchema>['query'];
type CreateBody = z.infer<typeof createProductSchema>['body'];
type UpdateBody = z.infer<typeof updateProductSchema>['body'];

export function toProduct(product: Product) {
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
  const where: Prisma.ProductWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toProduct),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function getProduct(organizationId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, organizationId } });
  if (!product) {
    throw notFound('Product not found');
  }
  return toProduct(product);
}

export async function createProduct(organizationId: string, userId: string, input: CreateBody) {
  const duplicate = await prisma.product.findFirst({
    where: { organizationId, sku: input.sku },
    select: { id: true },
  });
  if (duplicate) {
    throw conflict('SKU_CONFLICT', 'SKU already exists in this organization');
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
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
      },
    });

    await recordAudit(tx, {
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

export async function updateProduct(
  organizationId: string,
  userId: string,
  id: string,
  input: UpdateBody,
) {
  const existing = await prisma.product.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Product not found');
  }

  if (input.sku && input.sku !== existing.sku) {
    const duplicate = await prisma.product.findFirst({
      where: { organizationId, sku: input.sku, NOT: { id } },
      select: { id: true },
    });
    if (duplicate) {
      throw conflict('SKU_CONFLICT', 'SKU already exists in this organization');
    }
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: { id, organizationId },
      data: {
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
      },
    });

    if (updated.count === 0) {
      throw notFound('Product not found');
    }

    const fresh = await tx.product.findFirst({ where: { id, organizationId } });
    if (!fresh) {
      throw notFound('Product not found');
    }

    await recordAudit(tx, {
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
  const existing = await prisma.product.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Product not found');
  }

  const [sales, poItems] = await Promise.all([
    prisma.sale.count({ where: { organizationId, productId: id } }),
    prisma.purchaseOrderItem.count({ where: { organizationId, productId: id } }),
  ]);

  if (sales > 0 || poItems > 0) {
    throw conflict(
      'PRODUCT_IN_USE',
      'Cannot delete a product with sales or purchase order history. Deactivate it instead.',
    );
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.product.deleteMany({ where: { id, organizationId } });
    if (deleted.count === 0) {
      throw notFound('Product not found');
    }
    await recordAudit(tx, {
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
