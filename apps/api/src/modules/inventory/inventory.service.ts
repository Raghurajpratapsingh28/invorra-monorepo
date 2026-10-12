import { z } from 'zod';
import { DEMAND_LOOKBACK_DAYS } from '../../config/business';
import { can } from '../../config/permissions';
import { aggregate, cols, countDocs, findMany, findOne, insertOne, mapByIds, patchMany, withTransaction } from '../../db/mongo';
import type { InventoryDoc, ProductDoc, WarehouseDoc } from '../../domain/documents';
import type { UserRole } from '../../domain/enums';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { daysAgo } from '../../utils/dates';
import { conflict, forbidden, notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { daysOfInventory, riskRank, roundTo } from '../../utils/risk';
import { loadDailyDemand, seriesFor } from '../intelligence/history';
import { applyLeadTimeRisk, buildPositionPlan, stockoutProbability } from '../intelligence/planner';
import type { createInventorySchema, inventoryRisksSchema, listInventorySchema, updateInventorySchema } from './inventory.schema';

type ListQuery = z.infer<typeof listInventorySchema>['query'];
type RiskQuery = z.infer<typeof inventoryRisksSchema>['query'];
type CreateBody = z.infer<typeof createInventorySchema>['body'];
type UpdateBody = z.infer<typeof updateInventorySchema>['body'];

type InventoryView = InventoryDoc & {
  product: Pick<ProductDoc, 'id' | 'sku' | 'name' | 'unit' | 'unitCost' | 'sellingPrice' | 'status' | 'leadTimeDays' | 'moq'>;
  warehouse: Pick<WarehouseDoc, 'id' | 'code' | 'name' | 'city'>;
};

async function hydrate(rows: InventoryDoc[]): Promise<InventoryView[]> {
  const [products, warehouses] = await Promise.all([
    mapByIds<ProductDoc>(cols.products, rows.map((row) => row.productId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
  ]);
  return rows.flatMap((row) => {
    const product = products.get(row.productId);
    const warehouse = warehouses.get(row.warehouseId);
    if (!product || !warehouse) {
      return [];
    }
    return [{
      ...row,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        unitCost: product.unitCost,
        sellingPrice: product.sellingPrice,
        status: product.status,
        leadTimeDays: product.leadTimeDays,
        moq: product.moq,
      },
      warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name, city: warehouse.city },
    }];
  });
}

export function toInventory(row: InventoryView) {
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
  const inventoryFilter = {
    organizationId,
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
  };
  const [rows, grouped, history, storedForecasts] = await Promise.all([
    findMany<InventoryDoc>(cols.inventory, inventoryFilter).then(hydrate),
    aggregate<{ _id: { productId: string; warehouseId: string }; quantity: number }>(cols.sales, [
      {
        $match: {
          organizationId,
          soldAt: { $gte: since },
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        },
      },
      { $group: { _id: { productId: '$productId', warehouseId: '$warehouseId' }, quantity: { $sum: '$quantity' } } },
    ]),
    loadDailyDemand(organizationId, filters),
    findMany<{ productId: string; warehouseId: string; forecastDate: Date; predictedDemand: string; id: string }>(
      cols.forecasts,
      {
        organizationId,
        modelVersion: { $in: ['gbm-demand-v1', 'gbm-demand-v2'] },
        forecastDate: { $gte: new Date() },
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      },
      { sort: { forecastDate: 1 } },
    ),
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
    demand.set(demandKey(row._id.productId, row._id.warehouseId), row.quantity ?? 0);
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
  const filter = {
    organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.inventory, filter),
    findMany<InventoryDoc>(cols.inventory, filter, {
      sort: { updatedAt: -1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }).then(hydrate),
  ]);
  return { items: rows.map(toInventory), pagination: toPagination(query.page, query.limit, total) };
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
      if (rank !== 0) return rank;
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
  const row = await findOne<InventoryDoc>(cols.inventory, { _id: id, organizationId });
  if (!row) throw notFound('Inventory not found');
  const [view] = await hydrate([row]);
  if (!view) throw notFound('Inventory not found');
  return toInventory(view);
}

async function assertProductAndWarehouse(organizationId: string, productId: string, warehouseId: string) {
  const [product, warehouse] = await Promise.all([
    findOne<ProductDoc>(cols.products, { _id: productId, organizationId }),
    findOne<WarehouseDoc>(cols.warehouses, { _id: warehouseId, organizationId }),
  ]);
  if (!product) throw notFound('Product not found');
  if (!warehouse) throw notFound('Warehouse not found');
}

export async function createInventory(organizationId: string, userId: string, input: CreateBody) {
  await assertProductAndWarehouse(organizationId, input.productId, input.warehouseId);
  const existing = await findOne<InventoryDoc>(cols.inventory, {
    organizationId,
    productId: input.productId,
    warehouseId: input.warehouseId,
  });
  if (existing) {
    throw conflict('INVENTORY_EXISTS', 'Inventory already exists for this product and warehouse');
  }
  const created = await withTransaction(async () => {
    const row = await insertOne<InventoryDoc>(cols.inventory, {
      organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      reservedQty: input.reservedQty ?? 0,
      reorderPoint: input.reorderPoint ?? 0,
    });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.INVENTORY_CREATED,
      entityType: 'Inventory',
      entityId: row.id,
      metadata: { productId: row.productId, warehouseId: row.warehouseId, quantity: row.quantity },
    });
    return row;
  });
  const [view] = await hydrate([created]);
  if (!view) throw notFound('Inventory not found');
  return toInventory(view);
}

export async function updateInventory(
  organizationId: string,
  userId: string,
  role: UserRole,
  id: string,
  input: UpdateBody,
) {
  const existing = await findOne<InventoryDoc>(cols.inventory, { _id: id, organizationId });
  if (!existing) throw notFound('Inventory not found');
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
  const updated = await withTransaction(async () => {
    const result = await patchMany(cols.inventory, { _id: id, organizationId }, {
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.reservedQty !== undefined ? { reservedQty: input.reservedQty } : {}),
      ...(input.reorderPoint !== undefined ? { reorderPoint: input.reorderPoint } : {}),
    });
    if (result === 0) throw notFound('Inventory not found');
    const fresh = await findOne<InventoryDoc>(cols.inventory, { _id: id, organizationId });
    if (!fresh) throw notFound('Inventory not found');
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.INVENTORY_UPDATED,
      entityType: 'Inventory',
      entityId: id,
      metadata: {
        before: { quantity: existing.quantity, reservedQty: existing.reservedQty, reorderPoint: existing.reorderPoint },
        after: { quantity: fresh.quantity, reservedQty: fresh.reservedQty, reorderPoint: fresh.reorderPoint },
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
  const [view] = await hydrate([updated]);
  if (!view) throw notFound('Inventory not found');
  return toInventory(view);
}
