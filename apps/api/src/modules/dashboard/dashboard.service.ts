import { cols, countDocs, findMany, mapByIds, aggregate } from '../../db/mongo';
import type { InventoryDoc, ProductDoc, WarehouseDoc } from '../../domain/documents';
import { PurchaseOrderStatus, RiskLevel } from '../../domain/enums';
import { addUtcDays, daysAgo, startOfUtcDay } from '../../utils/dates';
import { decimalToString, toDecimal } from '../../utils/money';
import { calendarDatesEnding } from '../intelligence/planner';
import { getInventoryHealth } from '../inventory/inventory.service';

const OPEN_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.DRAFT,
  PurchaseOrderStatus.PENDING_APPROVAL,
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

async function salesWindow(organizationId: string, since: Date) {
  const rows = await aggregate<{ orders: number; units: number; revenue: string }>(cols.sales, [
    { $match: { organizationId, soldAt: { $gte: since } } },
    {
      $group: {
        _id: null,
        orders: { $sum: 1 },
        units: { $sum: '$quantity' },
        revenue: { $sum: { $toDecimal: '$totalAmount' } },
      },
    },
  ]);
  const aggregateRow = rows[0];
  return {
    orders: Number(aggregateRow?.orders ?? 0),
    units: Number(aggregateRow?.units ?? 0),
    revenue: decimalToString(aggregateRow?.revenue?.toString() ?? 0),
  };
}

export async function getDashboardSummary(organizationId: string, rangeDays = 30) {
  const since = daysAgo(rangeDays);
  const [products, warehouses, suppliers, inventoryRows, sales7, sales30, rangeSales, openPurchaseOrders, pendingApproval, pendingRecommendations, health, productSales, warehouseSales] =
    await Promise.all([
      countDocs(cols.products, { organizationId, status: 'ACTIVE' }),
      countDocs(cols.warehouses, { organizationId }),
      countDocs(cols.suppliers, { organizationId }),
      findMany<InventoryDoc>(cols.inventory, { organizationId }),
      salesWindow(organizationId, daysAgo(7)),
      salesWindow(organizationId, daysAgo(30)),
      salesWindow(organizationId, since),
      countDocs(cols.purchaseOrders, { organizationId, status: { $in: OPEN_STATUSES } }),
      countDocs(cols.purchaseOrders, { organizationId, status: PurchaseOrderStatus.PENDING_APPROVAL }),
      countDocs(cols.recommendations, { organizationId, status: 'PENDING' }),
      getInventoryHealth(organizationId),
      aggregate<{ _id: string; units: number; revenue: { toString(): string } }>(cols.sales, [
        { $match: { organizationId, soldAt: { $gte: since } } },
        { $group: { _id: '$productId', units: { $sum: '$quantity' }, revenue: { $sum: { $toDecimal: '$totalAmount' } } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      aggregate<{ _id: string; units: number; revenue: { toString(): string } }>(cols.sales, [
        { $match: { organizationId, soldAt: { $gte: since } } },
        { $group: { _id: '$warehouseId', units: { $sum: '$quantity' }, revenue: { $sum: { $toDecimal: '$totalAmount' } } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

  const productDocs = await mapByIds<ProductDoc>(
    cols.products,
    inventoryRows.map((row) => row.productId).concat(productSales.map((row) => row._id)),
  );
  const warehouseDocs = await mapByIds<WarehouseDoc>(
    cols.warehouses,
    warehouseSales.map((row) => row._id),
  );

  const inventoryValue = inventoryRows.reduce((sum, row) => {
    if (row.quantity <= 0) return sum;
    const unitCost = productDocs.get(row.productId)?.unitCost ?? '0';
    return sum.plus(toDecimal(row.quantity).mul(unitCost));
  }, toDecimal(0));

  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const row of health) {
    riskCounts[row.riskLevel] += 1;
  }

  const topProducts = productSales.map((row) => ({
    sku: productDocs.get(row._id)?.sku ?? row._id,
    name: productDocs.get(row._id)?.name ?? 'Product',
    units: Number(row.units ?? 0),
    revenue: decimalToString(row.revenue?.toString() ?? 0),
  }));
  const warehousePerformance = warehouseSales.map((row) => ({
    name: warehouseDocs.get(row._id)?.name ?? 'Warehouse',
    city: warehouseDocs.get(row._id)?.city ?? '',
    units: Number(row.units ?? 0),
    revenue: decimalToString(row.revenue?.toString() ?? 0),
  }));

  return {
    products,
    warehouses,
    suppliers,
    inventoryPositions: inventoryRows.length,
    inventoryValue: decimalToString(inventoryValue),
    sales: { last7Days: sales7, last30Days: sales30 },
    riskCounts,
    purchaseOrders: { open: openPurchaseOrders, pendingApproval },
    recommendations: { pending: pendingRecommendations },
    revenue: rangeSales.revenue,
    rangeDays,
    rangeSales,
    stockoutCount: riskCounts.HIGH + riskCounts.CRITICAL,
    criticalStockCount: riskCounts.CRITICAL,
    pendingRecommendations,
    pendingPurchaseOrders: pendingApproval,
    topProducts,
    warehousePerformance,
  };
}

export async function getSalesSeries(organizationId: string, days: number) {
  const end = startOfUtcDay(new Date());
  const start = addUtcDays(end, -(days - 1));
  const rows = await aggregate<{ _id: string; units: number; revenue: { toString(): string } }>(cols.sales, [
    { $match: { organizationId, soldAt: { $gte: start } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$soldAt', timezone: 'UTC' } },
        units: { $sum: '$quantity' },
        revenue: { $sum: { $toDecimal: '$totalAmount' } },
      },
    },
  ]);
  const byDay = new Map(rows.map((row) => [String(row._id), row]));
  return calendarDatesEnding(end.toISOString().slice(0, 10), days).map((date) => {
    const row = byDay.get(date);
    return {
      date,
      units: Number(row?.units ?? 0),
      revenue: decimalToString(row?.revenue?.toString() ?? 0),
    };
  });
}

export async function getInventoryHealthSummary(organizationId: string) {
  const health = await getInventoryHealth(organizationId);
  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const warehouses = new Map<
    string,
    { warehouseId: string; warehouseName: string; city: string; LOW: number; MEDIUM: number; HIGH: number; CRITICAL: number }
  >();
  for (const row of health) {
    riskCounts[row.riskLevel] += 1;
    const current = warehouses.get(row.warehouseId) ?? {
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      city: row.city,
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    current[row.riskLevel] += 1;
    warehouses.set(row.warehouseId, current);
  }
  return { riskCounts, byWarehouse: [...warehouses.values()] };
}

export async function getStockoutRisks(organizationId: string, limit = 12) {
  const health = await getInventoryHealth(organizationId);
  return health
    .filter(
      (row) =>
        row.riskLevel === RiskLevel.HIGH ||
        row.riskLevel === RiskLevel.CRITICAL ||
        row.stockoutProbability >= 0.5,
    )
    .sort((left, right) => right.stockoutProbability - left.stockoutProbability)
    .slice(0, limit);
}
