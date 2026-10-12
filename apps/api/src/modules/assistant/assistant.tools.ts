import { PurchaseOrderStatus } from '@prisma/client';
import { getDashboardSummary } from '../dashboard/dashboard.service';
import { getInventoryHealth } from '../inventory/inventory.service';
import { prisma } from '../../lib/prisma';

export async function getInventoryRisks(organizationId: string) {
  const rows = await getInventoryHealth(organizationId);
  return rows
    .map((row) => ({
      sku: row.sku,
      productName: row.productName,
      warehouse: row.warehouseName,
      city: row.city,
      currentStock: row.quantity,
      availableStock: row.availableQty,
      averageDailyDemand: row.averageDailyDemand,
      daysOfInventory: row.daysOfInventory,
      forecastDemand: row.horizonForecastDemand,
      leadTimeDemand: row.forecastDemand,
      leadTimeDays: row.leadTimeDays,
      safetyStock: row.safetyStock,
      moq: row.moq,
      stockoutProbability: row.stockoutProbability,
      riskLevel: row.riskLevel,
    }))
    .sort((left, right) => right.stockoutProbability - left.stockoutProbability);
}

export async function getReplenishmentRecommendations(organizationId: string) {
  const rows = await prisma.replenishmentRecommendation.findMany({
    where: { organizationId, status: 'PENDING' },
    include: {
      product: { select: { sku: true, name: true } },
      warehouse: { select: { name: true, city: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  return rows.map((row) => ({
    id: row.id,
    sku: row.product.sku,
    productName: row.product.name,
    warehouse: row.warehouse.name,
    city: row.warehouse.city,
    supplier: row.supplier?.name ?? null,
    currentStock: row.currentStock,
    forecastDemand: Number(row.forecastDemand),
    safetyStock: row.safetyStock,
    moq: row.moq,
    rawOrderQuantity: row.rawOrderQuantity,
    recommendedQty: row.recommendedQty,
    leadTimeDays: row.leadTimeDays,
    stockoutProbability: Number(row.stockoutProbability),
    riskLevel: row.riskLevel,
    status: row.status,
    explanation: row.rationale,
  }));
}

export async function getPurchaseOrders(organizationId: string, status?: PurchaseOrderStatus) {
  const rows = await prisma.purchaseOrder.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    include: {
      supplier: { select: { name: true } },
      warehouse: { select: { city: true } },
      items: { select: { quantity: true, unitCost: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((row) => ({
    id: row.id,
    poNumber: row.poNumber,
    status: row.status,
    supplier: row.supplier.name,
    city: row.warehouse.city,
    lines: row.items.length,
    quantity: row.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

export async function getDashboard(organizationId: string) {
  const summary = await getDashboardSummary(organizationId, 30);
  return {
    revenue30Days: summary.revenue,
    inventoryValue: summary.inventoryValue,
    stockoutCount: summary.stockoutCount,
    criticalStockCount: summary.criticalStockCount,
    pendingRecommendations: summary.pendingRecommendations,
    pendingPurchaseOrders: summary.pendingPurchaseOrders,
    activeProducts: summary.products,
    warehouses: summary.warehouses,
  };
}

export async function getProductByName(organizationId: string, query: string) {
  return prisma.product.findMany({
    where: {
      organizationId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, sku: true, name: true, leadTimeDays: true, moq: true, status: true },
    take: 5,
  });
}

export function mostCriticalWarehouse(
  risks: Awaited<ReturnType<typeof getInventoryRisks>>,
) {
  const counts = new Map<string, { warehouse: string; city: string; critical: number; high: number }>();
  for (const row of risks) {
    const current = counts.get(row.warehouse) ?? {
      warehouse: row.warehouse,
      city: row.city,
      critical: 0,
      high: 0,
    };
    if (row.riskLevel === 'CRITICAL') {
      current.critical += 1;
    }
    if (row.riskLevel === 'HIGH') {
      current.high += 1;
    }
    counts.set(row.warehouse, current);
  }
  return [...counts.values()].sort((left, right) => right.critical - left.critical || right.high - left.high);
}
