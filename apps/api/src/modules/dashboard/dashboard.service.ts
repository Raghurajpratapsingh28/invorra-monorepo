import { Prisma, PurchaseOrderStatus, RiskLevel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
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
  const aggregate = await prisma.sale.aggregate({
    where: { organizationId, soldAt: { gte: since } },
    _sum: { quantity: true, totalAmount: true },
    _count: { _all: true },
  });

  return {
    orders: aggregate._count._all,
    units: aggregate._sum.quantity ?? 0,
    revenue: decimalToString(aggregate._sum.totalAmount ?? 0),
  };
}

export async function getDashboardSummary(organizationId: string, rangeDays = 30) {
  const [products, warehouses, suppliers, inventoryRows, sales7, sales30, rangeSales, openPurchaseOrders, pendingApproval, pendingRecommendations, health] =
    await Promise.all([
      prisma.product.count({ where: { organizationId, status: 'ACTIVE' } }),
      prisma.warehouse.count({ where: { organizationId } }),
      prisma.supplier.count({ where: { organizationId } }),
      prisma.inventory.findMany({
        where: { organizationId },
        select: { quantity: true, product: { select: { unitCost: true } } },
      }),
      salesWindow(organizationId, daysAgo(7)),
      salesWindow(organizationId, daysAgo(30)),
      salesWindow(organizationId, daysAgo(rangeDays)),
      prisma.purchaseOrder.count({
        where: { organizationId, status: { in: OPEN_STATUSES } },
      }),
      prisma.purchaseOrder.count({
        where: { organizationId, status: PurchaseOrderStatus.PENDING_APPROVAL },
      }),
      prisma.replenishmentRecommendation.count({
        where: { organizationId, status: 'PENDING' },
      }),
      getInventoryHealth(organizationId),
    ]);

  const inventoryValue = inventoryRows.reduce((sum, row) => {
    if (row.quantity <= 0) {
      return sum;
    }
    return sum.plus(toDecimal(row.quantity).mul(row.product.unitCost));
  }, toDecimal(0));

  const riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const row of health) {
    riskCounts[row.riskLevel] += 1;
  }

  const since = daysAgo(rangeDays);
  const [productSales, warehouseSales] = await Promise.all([
    prisma.sale.groupBy({
      by: ['productId'],
      where: { organizationId, soldAt: { gte: since } },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5,
    }),
    prisma.sale.groupBy({
      by: ['warehouseId'],
      where: { organizationId, soldAt: { gte: since } },
      _sum: { quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: 'desc' } },
      take: 5,
    }),
  ]);
  const [productNames, warehouseNames] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId, id: { in: productSales.map((row) => row.productId) } },
      select: { id: true, sku: true, name: true },
    }),
    prisma.warehouse.findMany({
      where: { organizationId, id: { in: warehouseSales.map((row) => row.warehouseId) } },
      select: { id: true, name: true, city: true },
    }),
  ]);
  const productById = new Map(productNames.map((product) => [product.id, product]));
  const warehouseById = new Map(warehouseNames.map((warehouse) => [warehouse.id, warehouse]));
  const topProducts = productSales.map((row) => ({
    sku: productById.get(row.productId)?.sku ?? row.productId,
    name: productById.get(row.productId)?.name ?? 'Product',
    units: row._sum.quantity ?? 0,
    revenue: decimalToString(row._sum.totalAmount ?? 0),
  }));
  const warehousePerformance = warehouseSales.map((row) => ({
    name: warehouseById.get(row.warehouseId)?.name ?? 'Warehouse',
    city: warehouseById.get(row.warehouseId)?.city ?? '',
    units: row._sum.quantity ?? 0,
    revenue: decimalToString(row._sum.totalAmount ?? 0),
  }));

  return {
    products,
    warehouses,
    suppliers,
    inventoryPositions: inventoryRows.length,
    inventoryValue: decimalToString(inventoryValue),
    sales: {
      last7Days: sales7,
      last30Days: sales30,
    },
    riskCounts,
    purchaseOrders: {
      open: openPurchaseOrders,
      pendingApproval,
    },
    recommendations: {
      pending: pendingRecommendations,
    },
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
  const rows = await prisma.$queryRaw<Array<{ day: string; units: number; revenue: Prisma.Decimal }>>`
    SELECT to_char(("soldAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
           SUM("quantity")::int AS units,
           SUM("totalAmount") AS revenue
    FROM "Sale"
    WHERE "organizationId" = ${organizationId}
      AND "soldAt" >= ${start}
    GROUP BY day
    ORDER BY day
  `;
  const byDay = new Map(rows.map((row) => [String(row.day), row]));
  return calendarDatesEnding(end.toISOString().slice(0, 10), days).map((date) => {
    const row = byDay.get(date);
    return {
      date,
      units: Number(row?.units ?? 0),
      revenue: decimalToString(row?.revenue ?? 0),
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

  return {
    riskCounts,
    byWarehouse: [...warehouses.values()],
  };
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
