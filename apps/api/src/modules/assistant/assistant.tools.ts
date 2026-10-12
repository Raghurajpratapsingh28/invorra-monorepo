import { cols, contains, findMany, mapByIds } from '../../db/mongo';
import type { ProductDoc, PurchaseOrderDoc, RecommendationDoc, SupplierDoc, WarehouseDoc } from '../../domain/documents';
import type { PurchaseOrderStatus } from '../../domain/enums';
import { getDashboardSummary } from '../dashboard/dashboard.service';
import { getInventoryHealth } from '../inventory/inventory.service';

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
  const rows = await findMany<RecommendationDoc>(
    cols.recommendations,
    { organizationId, status: 'PENDING' },
    { sort: { createdAt: -1 }, limit: 25 },
  );
  const [products, warehouses, suppliers] = await Promise.all([
    mapByIds<ProductDoc>(cols.products, rows.map((row) => row.productId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
    mapByIds<SupplierDoc>(
      cols.suppliers,
      rows.map((row) => row.supplierId).filter((id): id is string => Boolean(id)),
    ),
  ]);
  return rows.map((row) => ({
    id: row.id,
    sku: products.get(row.productId)?.sku ?? '',
    productName: products.get(row.productId)?.name ?? '',
    warehouse: warehouses.get(row.warehouseId)?.name ?? '',
    city: warehouses.get(row.warehouseId)?.city ?? '',
    supplier: row.supplierId ? suppliers.get(row.supplierId)?.name ?? null : null,
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
  const rows = await findMany<PurchaseOrderDoc>(
    cols.purchaseOrders,
    { organizationId, ...(status ? { status } : {}) },
    { sort: { createdAt: -1 }, limit: 20 },
  );
  const [suppliers, warehouses] = await Promise.all([
    mapByIds<SupplierDoc>(cols.suppliers, rows.map((row) => row.supplierId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
  ]);
  return rows.map((row) => ({
    id: row.id,
    poNumber: row.poNumber,
    status: row.status,
    supplier: suppliers.get(row.supplierId)?.name ?? '',
    city: warehouses.get(row.warehouseId)?.city ?? '',
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
  const rows = await findMany<ProductDoc>(
    cols.products,
    {
      organizationId,
      $or: [{ name: contains(query) }, { sku: contains(query) }],
    },
    { limit: 5 },
  );
  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    leadTimeDays: row.leadTimeDays,
    moq: row.moq,
    status: row.status,
  }));
}

export function mostCriticalWarehouse(risks: Awaited<ReturnType<typeof getInventoryRisks>>) {
  const counts = new Map<string, { warehouse: string; city: string; critical: number; high: number }>();
  for (const row of risks) {
    const current = counts.get(row.warehouse) ?? {
      warehouse: row.warehouse,
      city: row.city,
      critical: 0,
      high: 0,
    };
    if (row.riskLevel === 'CRITICAL') current.critical += 1;
    if (row.riskLevel === 'HIGH') current.high += 1;
    counts.set(row.warehouse, current);
  }
  return [...counts.values()].sort((left, right) => right.critical - left.critical || right.high - left.high);
}
