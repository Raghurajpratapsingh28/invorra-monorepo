import { Prisma, ReplenishmentRecommendation } from '@prisma/client';
import { z } from 'zod';
import { PLANNING_HORIZON_DAYS, RECOMMENDATION_TTL_DAYS } from '../../config/business';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { addUtcDays } from '../../utils/dates';
import { conflict, notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { createPoNumber } from '../../utils/po-number';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { composeOrder } from '../intelligence/planner';
import { getInventoryHealth } from '../inventory/inventory.service';
import type {
  approveRecommendationSchema,
  listRecommendationsSchema,
  rejectRecommendationSchema,
} from './replenishment.schema';

type ListQuery = z.infer<typeof listRecommendationsSchema>['query'];
type ApproveBody = z.infer<typeof approveRecommendationSchema>['body'];
type RejectBody = z.infer<typeof rejectRecommendationSchema>['body'];

const recommendationInclude = {
  product: { select: { id: true, sku: true, name: true, unitCost: true } },
  warehouse: { select: { id: true, code: true, name: true, city: true } },
  supplier: { select: { id: true, name: true, code: true, leadTimeDays: true } },
} satisfies Prisma.ReplenishmentRecommendationInclude;

type RecommendationRow = Prisma.ReplenishmentRecommendationGetPayload<{
  include: typeof recommendationInclude;
}>;

export function toRecommendation(row: RecommendationRow | ReplenishmentRecommendation) {
  const product = 'product' in row ? row.product : undefined;
  const warehouse = 'warehouse' in row ? row.warehouse : undefined;
  const supplier = 'supplier' in row ? row.supplier : undefined;
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    warehouseId: row.warehouseId,
    supplierId: row.supplierId,
    recommendedQty: row.recommendedQty,
    currentStock: row.currentStock,
    averageDailyDemand: decimalToString(row.averageDailyDemand),
    daysOfInventory: row.daysOfInventory ? decimalToString(row.daysOfInventory) : null,
    forecastDemand: decimalToString(row.forecastDemand),
    safetyStock: row.safetyStock,
    leadTimeDays: row.leadTimeDays,
    moq: row.moq,
    stockoutProbability: decimalToString(row.stockoutProbability),
    rawOrderQuantity: row.rawOrderQuantity,
    planningHorizonDays: row.planningHorizonDays,
    riskLevel: row.riskLevel,
    status: row.status,
    rationale: row.rationale,
    explanation: row.rationale,
    expiresAt: row.expiresAt,
    product: product
      ? { ...product, unitCost: 'unitCost' in product ? decimalToString(product.unitCost) : undefined }
      : undefined,
    warehouse,
    supplier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function expireStale(organizationId: string) {
  await prisma.replenishmentRecommendation.updateMany({
    where: {
      organizationId,
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}

export async function listRecommendations(organizationId: string, query: ListQuery) {
  await expireStale(organizationId);
  const where: Prisma.ReplenishmentRecommendationWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.replenishmentRecommendation.count({ where }),
    prisma.replenishmentRecommendation.findMany({
      where,
      include: recommendationInclude,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toRecommendation),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function getRecommendation(organizationId: string, id: string) {
  const row = await prisma.replenishmentRecommendation.findFirst({
    where: { id, organizationId },
    include: recommendationInclude,
  });
  if (!row) {
    throw notFound('Recommendation not found');
  }
  return toRecommendation(row);
}

export async function generateRecommendations(organizationId: string, userId: string) {
  const [health, supplier] = await Promise.all([
    getInventoryHealth(organizationId),
    prisma.supplier.findFirst({
      where: { organizationId },
      orderBy: [{ leadTimeDays: 'asc' }, { code: 'asc' }],
    }),
  ]);
  const expiresAt = addUtcDays(new Date(), RECOMMENDATION_TTL_DAYS);
  const drafts = health.flatMap((row) => {
    const order = composeOrder({
      forecastDemand: row.horizonForecastDemand,
      safetyStock: row.safetyStock,
      currentStock: row.availableQty,
      moq: row.moq,
    });
    if (order.recommendedQty <= 0) {
      return [];
    }
    return [
      {
        organizationId,
        productId: row.productId,
        warehouseId: row.warehouseId,
        supplierId: supplier?.id ?? null,
        recommendedQty: order.recommendedQty,
        currentStock: row.availableQty,
        averageDailyDemand: row.averageDailyDemand.toFixed(4),
        daysOfInventory: row.daysOfInventory === null ? null : row.daysOfInventory.toFixed(2),
        forecastDemand: row.horizonForecastDemand.toFixed(2),
        safetyStock: row.safetyStock,
        leadTimeDays: row.leadTimeDays,
        moq: row.moq,
        stockoutProbability: row.stockoutProbability.toFixed(4),
        rawOrderQuantity: order.rawOrderQuantity,
        planningHorizonDays: PLANNING_HORIZON_DAYS,
        riskLevel: row.riskLevel,
        status: 'PENDING' as const,
        expiresAt,
        rationale: order.explanation,
      },
    ];
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.replenishmentRecommendation.deleteMany({
      where: { organizationId, status: 'PENDING' },
    });
    if (drafts.length > 0) {
      await tx.replenishmentRecommendation.createMany({ data: drafts });
    }
    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.RECOMMENDATION_CREATED,
      entityType: 'ReplenishmentRecommendation',
      metadata: { created: drafts.length },
    });
    return drafts.length;
  });

  void publishEvent({
    name: DomainEventName.RECOMMENDATION_CREATED,
    organizationId,
    entityType: 'ReplenishmentRecommendation',
    payload: { created },
  });

  return { created, planningHorizonDays: PLANNING_HORIZON_DAYS };
}

export async function approveRecommendation(
  organizationId: string,
  userId: string,
  id: string,
  input: ApproveBody,
) {
  const approved = await prisma.$transaction(async (tx) => {
    const recommendation = await tx.replenishmentRecommendation.findFirst({
      where: { id, organizationId },
    });
    if (!recommendation) {
      throw notFound('Recommendation not found');
    }
    if (recommendation.status !== 'PENDING') {
      throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be approved');
    }
    if (recommendation.expiresAt && recommendation.expiresAt < new Date()) {
      await tx.replenishmentRecommendation.updateMany({
        where: { id, organizationId, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      throw conflict('RECOMMENDATION_EXPIRED', 'This recommendation has expired');
    }

    const supplierId = input.supplierId ?? recommendation.supplierId;
    if (!supplierId) {
      throw conflict('SUPPLIER_REQUIRED', 'Choose a supplier before approving this recommendation');
    }
    const [supplier, product] = await Promise.all([
      tx.supplier.findFirst({ where: { id: supplierId, organizationId } }),
      tx.product.findFirst({ where: { id: recommendation.productId, organizationId } }),
    ]);
    if (!supplier) {
      throw notFound('Supplier not found');
    }
    if (!product) {
      throw notFound('Product not found');
    }

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        warehouseId: recommendation.warehouseId,
        recommendationId: recommendation.id,
        poNumber: createPoNumber(),
        status: 'PENDING_APPROVAL',
        createdById: userId,
        expectedAt: addUtcDays(new Date(), supplier.leadTimeDays),
        notes: 'Created from replenishment recommendation',
        items: {
          create: {
            organizationId,
            productId: product.id,
            quantity: recommendation.recommendedQty,
            unitCost: product.unitCost,
          },
        },
      },
      include: { items: true },
    });

    await tx.replenishmentRecommendation.updateMany({
      where: { id, organizationId, status: 'PENDING' },
      data: { status: 'APPROVED', supplierId: supplier.id },
    });

    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.RECOMMENDATION_APPROVED,
      entityType: 'ReplenishmentRecommendation',
      entityId: id,
      metadata: { purchaseOrderId: purchaseOrder.id, poNumber: purchaseOrder.poNumber },
    });

    return {
      recommendationId: id,
      status: 'APPROVED' as const,
      purchaseOrderId: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      purchaseOrderStatus: purchaseOrder.status,
    };
  });
  void publishEvent({
    name: DomainEventName.PO_CREATED,
    organizationId,
    entityType: 'PurchaseOrder',
    entityId: approved.purchaseOrderId,
    payload: { poNumber: approved.poNumber, recommendationId: id },
  });
  return approved;
}

export async function rejectRecommendation(
  organizationId: string,
  userId: string,
  id: string,
  input: RejectBody,
) {
  const existing = await prisma.replenishmentRecommendation.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw notFound('Recommendation not found');
  }
  if (existing.status !== 'PENDING') {
    throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be rejected');
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.replenishmentRecommendation.updateMany({
      where: { id, organizationId, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (updated.count === 0) {
      throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be rejected');
    }
    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.RECOMMENDATION_REJECTED,
      entityType: 'ReplenishmentRecommendation',
      entityId: id,
      metadata: input.reason ? { reason: input.reason } : {},
    });
  });

  return { id, status: 'REJECTED' as const };
}
