import { z } from 'zod';
import { PLANNING_HORIZON_DAYS, RECOMMENDATION_TTL_DAYS } from '../../config/business';
import {
  cols,
  countDocs,
  findMany,
  findOne,
  insertMany,
  insertOne,
  mapByIds,
  newId,
  patchMany,
  removeMany,
  withTransaction,
} from '../../db/mongo';
import type {
  ProductDoc,
  PurchaseOrderDoc,
  RecommendationDoc,
  SupplierDoc,
  WarehouseDoc,
} from '../../domain/documents';
import { PurchaseOrderStatus, RecommendationStatus } from '../../domain/enums';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { addUtcDays } from '../../utils/dates';
import { conflict, notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { createPoNumber } from '../../utils/po-number';
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

type RecommendationView = RecommendationDoc & {
  product?: Pick<ProductDoc, 'id' | 'sku' | 'name' | 'unitCost'>;
  warehouse?: Pick<WarehouseDoc, 'id' | 'code' | 'name' | 'city'>;
  supplier?: Pick<SupplierDoc, 'id' | 'name' | 'code' | 'leadTimeDays'> | null;
};

async function hydrate(rows: RecommendationDoc[]): Promise<RecommendationView[]> {
  const [products, warehouses, suppliers] = await Promise.all([
    mapByIds<ProductDoc>(cols.products, rows.map((row) => row.productId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
    mapByIds<SupplierDoc>(
      cols.suppliers,
      rows.map((row) => row.supplierId).filter((id): id is string => Boolean(id)),
    ),
  ]);
  return rows.map((row) => {
    const product = products.get(row.productId);
    const warehouse = warehouses.get(row.warehouseId);
    const supplier = row.supplierId ? suppliers.get(row.supplierId) : undefined;
    return {
      ...row,
      ...(product ? { product: { id: product.id, sku: product.sku, name: product.name, unitCost: product.unitCost } } : {}),
      ...(warehouse
        ? { warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name, city: warehouse.city } }
        : {}),
      supplier: supplier
        ? { id: supplier.id, name: supplier.name, code: supplier.code, leadTimeDays: supplier.leadTimeDays }
        : null,
    };
  });
}

export function toRecommendation(row: RecommendationView) {
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
    product: row.product ? { ...row.product, unitCost: decimalToString(row.product.unitCost) } : undefined,
    warehouse: row.warehouse,
    supplier: row.supplier,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function expireStale(organizationId: string) {
  await patchMany(
    cols.recommendations,
    { organizationId, status: RecommendationStatus.PENDING, expiresAt: { $lt: new Date() } },
    { status: RecommendationStatus.EXPIRED },
  );
}

export async function listRecommendations(organizationId: string, query: ListQuery) {
  await expireStale(organizationId);
  const filter = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.riskLevel ? { riskLevel: query.riskLevel } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.recommendations, filter),
    findMany<RecommendationDoc>(cols.recommendations, filter, {
      sort: { createdAt: -1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }).then(hydrate),
  ]);
  return { items: rows.map(toRecommendation), pagination: toPagination(query.page, query.limit, total) };
}

export async function getRecommendation(organizationId: string, id: string) {
  const row = await findOne<RecommendationDoc>(cols.recommendations, { _id: id, organizationId });
  if (!row) throw notFound('Recommendation not found');
  const [view] = await hydrate([row]);
  if (!view) throw notFound('Recommendation not found');
  return toRecommendation(view);
}

export async function generateRecommendations(organizationId: string, userId: string) {
  const health = await getInventoryHealth(organizationId);
  const suppliers = await findMany<SupplierDoc>(
    cols.suppliers,
    { organizationId },
    { sort: { leadTimeDays: 1, code: 1 }, limit: 1 },
  );
  const supplier = suppliers[0];
  const expiresAt = addUtcDays(new Date(), RECOMMENDATION_TTL_DAYS);
  const drafts = health.flatMap((row) => {
    const order = composeOrder({
      forecastDemand: row.horizonForecastDemand,
      safetyStock: row.safetyStock,
      currentStock: row.availableQty,
      moq: row.moq,
    });
    if (order.recommendedQty <= 0) return [];
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
        status: RecommendationStatus.PENDING,
        expiresAt,
        rationale: order.explanation,
      },
    ];
  });

  const created = await withTransaction(async () => {
    await removeMany(cols.recommendations, { organizationId, status: RecommendationStatus.PENDING });
    if (drafts.length > 0) {
      await insertMany<RecommendationDoc>(cols.recommendations, drafts);
    }
    await recordAudit({
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
  const approved = await withTransaction(async () => {
    const recommendation = await findOne<RecommendationDoc>(cols.recommendations, { _id: id, organizationId });
    if (!recommendation) throw notFound('Recommendation not found');
    if (recommendation.status !== RecommendationStatus.PENDING) {
      throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be approved');
    }
    if (recommendation.expiresAt && recommendation.expiresAt < new Date()) {
      await patchMany(
        cols.recommendations,
        { _id: id, organizationId, status: RecommendationStatus.PENDING },
        { status: RecommendationStatus.EXPIRED },
      );
      throw conflict('RECOMMENDATION_EXPIRED', 'This recommendation has expired');
    }

    const supplierId = input.supplierId ?? recommendation.supplierId;
    if (!supplierId) {
      throw conflict('SUPPLIER_REQUIRED', 'Choose a supplier before approving this recommendation');
    }
    const supplier = await findOne<SupplierDoc>(cols.suppliers, { _id: supplierId, organizationId });
    const product = await findOne<ProductDoc>(cols.products, { _id: recommendation.productId, organizationId });
    if (!supplier) throw notFound('Supplier not found');
    if (!product) throw notFound('Product not found');

    const purchaseOrder = await insertOne<PurchaseOrderDoc>(cols.purchaseOrders, {
      organizationId,
      supplierId: supplier.id,
      warehouseId: recommendation.warehouseId,
      recommendationId: recommendation.id,
      poNumber: createPoNumber(),
      status: PurchaseOrderStatus.PENDING_APPROVAL,
      createdById: userId,
      expectedAt: addUtcDays(new Date(), supplier.leadTimeDays),
      notes: 'Created from replenishment recommendation',
      approvedById: null,
      orderedAt: null,
      items: [
        {
          id: newId(),
          organizationId,
          productId: product.id,
          quantity: recommendation.recommendedQty,
          unitCost: product.unitCost,
          receivedQty: 0,
        },
      ],
    });

    const updated = await patchMany(
      cols.recommendations,
      { _id: id, organizationId, status: RecommendationStatus.PENDING },
      { status: RecommendationStatus.APPROVED, supplierId: supplier.id },
    );
    if (updated === 0) {
      throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be approved');
    }

    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.RECOMMENDATION_APPROVED,
      entityType: 'ReplenishmentRecommendation',
      entityId: id,
      metadata: { purchaseOrderId: purchaseOrder.id, poNumber: purchaseOrder.poNumber },
    });

    return {
      recommendationId: id,
      status: RecommendationStatus.APPROVED,
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
  const existing = await findOne<RecommendationDoc>(cols.recommendations, { _id: id, organizationId });
  if (!existing) throw notFound('Recommendation not found');
  if (existing.status !== RecommendationStatus.PENDING) {
    throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be rejected');
  }

  await withTransaction(async () => {
    const updated = await patchMany(
      cols.recommendations,
      { _id: id, organizationId, status: RecommendationStatus.PENDING },
      { status: RecommendationStatus.REJECTED },
    );
    if (updated === 0) {
      throw conflict('RECOMMENDATION_CLOSED', 'Only pending recommendations can be rejected');
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.RECOMMENDATION_REJECTED,
      entityType: 'ReplenishmentRecommendation',
      entityId: id,
      metadata: input.reason ? { reason: input.reason } : {},
    });
  });

  return { id, status: RecommendationStatus.REJECTED };
}
