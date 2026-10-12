import { Prisma, UserRole } from '@prisma/client';
import { z } from 'zod';
import { DEMAND_LOOKBACK_DAYS } from '../../config/business';
import { can } from '../../config/permissions';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { daysAgo } from '../../utils/dates';
import { conflict, forbidden, notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { loadDailyDemand, seriesFor } from '../intelligence/history';
import { applyLeadTimeRisk, buildPositionPlan, stockoutProbability } from '../intelligence/planner';
import { daysOfInventory, riskRank, roundTo } from '../../utils/risk';
import type {
  createInventorySchema,
  inventoryRisksSchema,
  listInventorySchema,
  updateInventorySchema,
} from './inventory.schema';

type ListQuery = z.infer<typeof listInventorySchema>['query'];
type RiskQuery = z.infer<typeof inventoryRisksSchema>['query'];
type CreateBody = z.infer<typeof createInventorySchema>['body'];
type UpdateBody = z.infer<typeof updateInventorySchema>['body'];

const inventoryInclude = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      unitCost: true,
      sellingPrice: true,
      status: true,
      leadTimeDays: true,
      moq: true,
    },
  },
  warehouse: {
    select: { id: true, code: true, name: true, city: true },
  },
} satisfies Prisma.InventoryInclude;

type InventoryWithRelations = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

export function toInventory(row: InventoryWithRelations) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    warehouseId: row.warehouseId,
    quantity: row.quantity,
    reservedQty: row.reservedQty,
    reorderPoint: row.reorderPoint,
    availableQty: row.quantity - row.reservedQty,
    product: {
      ...row.product,
      unitCost: decimalToString(row.product.unitCost),
      sellingPrice: decimalToString(row.product.sellingPrice),
    },
    warehouse: row.warehouse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function demandKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

export async function getInventoryHealth(
  organizationId: string,
  filters: { productId?: string; warehouseId?: string } = {},
) {
  const since = daysAgo(DEMAND_LOOKBACK_DAYS);
  const inventoryWhere: Prisma.InventoryWhereInput = {
    organizationId,
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
  };

  const [rows, grouped, history, storedForecasts] = await Promise.all([
    prisma.inventory.findMany({
      where: inventoryWhere,
      include: inventoryInclude,
    }),
    prisma.sale.groupBy({
      by: ['productId', 'warehouseId'],
      where: {
        organizationId,
        soldAt: { gte: since },
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      _sum: { quantity: true },
    }),
    loadDailyDemand(organizationId, filters),
    prisma.forecast.findMany({
      where: {
        organizationId,
        modelVersion: { in: ['gbm-demand-v1', 'gbm-demand-v2'] },
        forecastDate: { gte: new Date() },
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      select: { productId: true, warehouseId: true, forecastDate: true, predictedDemand: true },
      orderBy: { forecastDate: 'asc' },
    }),
  ]);

  const forecastByPosition = new Map<string, number[]>();
  for (const forecast of storedForecasts) {
    const key = demandKey(forecast.productId, forecast.warehouseId);
    const series = forecastByPosition.get(key) ?? [];
    series.push(Number(forecast.predictedDemand));
    forecastByPosition.set(key, series);
  }

  const demand = new Map<string, number>();
  for (const row of grouped) {
    demand.set(demandKey(row.productId, row.warehouseId), row._sum.quantity ?? 0);
  }

  return rows.map((row) => {
    const unitsSold = demand.get(demandKey(row.productId, row.warehouseId)) ?? 0;
    const averageDailyDemand = unitsSold / DEMAND_LOOKBACK_DAYS;
    const cover = daysOfInventory(row.quantity, averageDailyDemand);
    const available = row.quantity - row.reservedQty;
    const plan = buildPositionPlan({
      history: seriesFor(history.byPosition, row.productId, row.warehouseId, history.dates),
      historyDates: history.dates,
      currentStock: available,
      leadTimeDays: row.product.leadTimeDays,
      moq: row.product.moq,
    });
    const stored = forecastByPosition.get(demandKey(row.productId, row.warehouseId));
    const leadDays = Math.max(0, row.product.leadTimeDays);
    const leadTimeDemand = stored ? stored.slice(0, leadDays).reduce((sum, value) => sum + value, 0) : plan.leadTimeDemand;
    const horizonForecastDemand = stored
      ? stored.slice(0, 14).reduce((sum, value) => sum + value, 0)
      : plan.horizonForecastDemand;
    const probability = stored
      ? stockoutProbability({
          availableStock: available,
          leadTimeDays: row.product.leadTimeDays,
          leadTimeDemand,
          dailyStdDev: plan.dailyStdDev,
        })
      : plan.stockoutProbability;
    const riskLevel = applyLeadTimeRisk(cover, row.product.leadTimeDays);

    return {
      inventoryId: row.id,
      productId: row.productId,
      sku: row.product.sku,
      productName: row.product.name,
      productStatus: row.product.status,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouse.name,
      warehouseCode: row.warehouse.code,
      city: row.warehouse.city,
      quantity: row.quantity,
      reservedQty: row.reservedQty,
      availableQty: available,
      unitsSold,
      averageDailyDemand: roundTo(averageDailyDemand, 4),
      daysOfInventory: cover === null ? null : roundTo(cover, 2),
      forecastDemand: roundTo(leadTimeDemand, 2),
      horizonForecastDemand: roundTo(horizonForecastDemand, 2),
      stockoutProbability: probability,
      forecastModel: stored ? 'gbm-demand-v2' : 'weighted-ma-v1',
      dailyStdDev: plan.dailyStdDev,
      safetyStock: plan.safetyStock,
      leadTimeDays: row.product.leadTimeDays,
      moq: row.product.moq,
      confidence: plan.confidence,
      riskLevel,
      lookbackDays: DEMAND_LOOKBACK_DAYS,
    };
  });
}

export async function listInventory(organizationId: string, query: ListQuery) {
  const where: Prisma.InventoryWhereInput = {
    organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.inventory.count({ where }),
    prisma.inventory.findMany({
      where,
      include: inventoryInclude,
      orderBy: { updatedAt: 'desc' },
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toInventory),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function listRisks(organizationId: string, query: RiskQuery) {
  const health = await getInventoryHealth(organizationId, {
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  });

  const search = query.search?.toLowerCase();
  const filtered = health
    .filter((row) => (query.riskLevel ? row.riskLevel === query.riskLevel : true))
    .filter((row) =>
      search
        ? row.sku.toLowerCase().includes(search) ||
          row.productName.toLowerCase().includes(search) ||
          row.warehouseName.toLowerCase().includes(search) ||
          row.city.toLowerCase().includes(search)
        : true,
    )
    .sort((left, right) => {
      const rank = riskRank(left.riskLevel) - riskRank(right.riskLevel);
      if (rank !== 0) {
        return rank;
      }
      const leftDays = left.daysOfInventory ?? Number.POSITIVE_INFINITY;
      const rightDays = right.daysOfInventory ?? Number.POSITIVE_INFINITY;
      return leftDays - rightDays;
    });

  const start = toSkip(query.page, query.limit);
  return {
    items: filtered.slice(start, start + query.limit),
    pagination: toPagination(query.page, query.limit, filtered.length),
  };
}

export async function getInventory(organizationId: string, id: string) {
  const row = await prisma.inventory.findFirst({
    where: { id, organizationId },
    include: inventoryInclude,
  });
  if (!row) {
    throw notFound('Inventory not found');
  }
  return toInventory(row);
}

async function assertProductAndWarehouse(organizationId: string, productId: string, warehouseId: string) {
  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, organizationId }, select: { id: true } }),
    prisma.warehouse.findFirst({ where: { id: warehouseId, organizationId }, select: { id: true } }),
  ]);
  if (!product) {
    throw notFound('Product not found');
  }
  if (!warehouse) {
    throw notFound('Warehouse not found');
  }
}

export async function createInventory(organizationId: string, userId: string, input: CreateBody) {
  await assertProductAndWarehouse(organizationId, input.productId, input.warehouseId);

  const existing = await prisma.inventory.findFirst({
    where: { organizationId, productId: input.productId, warehouseId: input.warehouseId },
    select: { id: true },
  });
  if (existing) {
    throw conflict(
      'INVENTORY_EXISTS',
      'Inventory already exists for this product and warehouse',
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.inventory.create({
      data: {
        organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        reservedQty: input.reservedQty ?? 0,
        reorderPoint: input.reorderPoint ?? 0,
      },
      include: inventoryInclude,
    });
    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.INVENTORY_CREATED,
      entityType: 'Inventory',
      entityId: row.id,
      metadata: {
        productId: row.productId,
        warehouseId: row.warehouseId,
        quantity: row.quantity,
      },
    });
    return row;
  });

  return toInventory(created);
}

export async function updateInventory(
  organizationId: string,
  userId: string,
  role: UserRole,
  id: string,
  input: UpdateBody,
) {
  const existing = await prisma.inventory.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Inventory not found');
  }

  const nextQuantity = input.quantity ?? existing.quantity;
  const nextReserved = input.reservedQty ?? existing.reservedQty;

  if (nextQuantity < 0 && !input.allowNegative) {
    throw conflict('NEGATIVE_STOCK', 'Inventory cannot become negative unless explicitly allowed');
  }
  if (nextQuantity < 0 && input.allowNegative && !can(role, 'inventory', 'approve')) {
    throw forbidden('Only owners and admins can set inventory below zero');
  }
  if (nextReserved > nextQuantity && nextQuantity >= 0) {
    throw conflict('RESERVED_EXCEEDS_STOCK', 'Reserved quantity cannot exceed on-hand quantity');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inventory.updateMany({
      where: { id, organizationId },
      data: {
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.reservedQty !== undefined ? { reservedQty: input.reservedQty } : {}),
        ...(input.reorderPoint !== undefined ? { reorderPoint: input.reorderPoint } : {}),
      },
    });
    if (result.count === 0) {
      throw notFound('Inventory not found');
    }
    const fresh = await tx.inventory.findFirst({
      where: { id, organizationId },
      include: inventoryInclude,
    });
    if (!fresh) {
      throw notFound('Inventory not found');
    }
    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.INVENTORY_UPDATED,
      entityType: 'Inventory',
      entityId: id,
      metadata: {
        before: {
          quantity: existing.quantity,
          reservedQty: existing.reservedQty,
          reorderPoint: existing.reorderPoint,
        },
        after: {
          quantity: fresh.quantity,
          reservedQty: fresh.reservedQty,
          reorderPoint: fresh.reorderPoint,
        },
      },
    });
    return fresh;
  });

  void publishEvent({
    name: DomainEventName.INVENTORY_UPDATED,
    organizationId,
    entityType: 'Inventory',
    entityId: updated.id,
    payload: { quantity: updated.quantity },
  });

  return toInventory(updated);
}
