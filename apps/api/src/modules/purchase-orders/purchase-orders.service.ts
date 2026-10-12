import { z } from 'zod';
import { can } from '../../config/permissions';
import {
  cols,
  countDocs,
  findMany,
  findOne,
  insertOne,
  mapByIds,
  newId,
  patchOne,
  withTransaction,
} from '../../db/mongo';
import type {
  AuditLogDoc,
  InventoryDoc,
  ProductDoc,
  PurchaseOrderDoc,
  PurchaseOrderItemDoc,
  RecommendationDoc,
  SupplierDoc,
  UserDoc,
  WarehouseDoc,
} from '../../domain/documents';
import { PurchaseOrderStatus, RecommendationStatus, type UserRole } from '../../domain/enums';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { conflict, forbidden, notFound } from '../../utils/errors';
import { decimalToString, toDecimal } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { createPoNumber } from '../../utils/po-number';
import type {
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  receivePurchaseOrderSchema,
  updatePurchaseOrderSchema,
} from './purchase-orders.schema';

type ListQuery = z.infer<typeof listPurchaseOrdersSchema>['query'];
type CreateBody = z.infer<typeof createPurchaseOrderSchema>['body'];
type UpdateBody = z.infer<typeof updatePurchaseOrderSchema>['body'];
type ReceiveBody = z.infer<typeof receivePurchaseOrderSchema>['body'];

const TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: [PurchaseOrderStatus.PENDING_APPROVAL, PurchaseOrderStatus.CANCELLED],
  PENDING_APPROVAL: [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.CANCELLED],
  APPROVED: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED],
  SENT: [PurchaseOrderStatus.CANCELLED],
  PARTIALLY_RECEIVED: [PurchaseOrderStatus.CANCELLED],
  RECEIVED: [],
  CANCELLED: [],
};

type OrderView = PurchaseOrderDoc & {
  supplier?: Pick<SupplierDoc, 'id' | 'name' | 'code'>;
  warehouse?: Pick<WarehouseDoc, 'id' | 'name' | 'code' | 'city'>;
};

async function hydrate(rows: PurchaseOrderDoc[]): Promise<OrderView[]> {
  const [suppliers, warehouses] = await Promise.all([
    mapByIds<SupplierDoc>(cols.suppliers, rows.map((row) => row.supplierId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
  ]);
  return rows.map((row) => {
    const supplier = suppliers.get(row.supplierId);
    const warehouse = warehouses.get(row.warehouseId);
    return {
      ...row,
      ...(supplier ? { supplier: { id: supplier.id, name: supplier.name, code: supplier.code } } : {}),
      ...(warehouse
        ? { warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code, city: warehouse.city } }
        : {}),
    };
  });
}

export function toPurchaseOrder(order: OrderView) {
  const total = order.items.reduce(
    (sum, item) => sum.plus(toDecimal(item.unitCost).mul(item.quantity)),
    toDecimal(0),
  );
  return {
    id: order.id,
    organizationId: order.organizationId,
    supplierId: order.supplierId,
    warehouseId: order.warehouseId,
    recommendationId: order.recommendationId,
    poNumber: order.poNumber,
    status: order.status,
    notes: order.notes,
    orderedAt: order.orderedAt,
    expectedAt: order.expectedAt,
    createdById: order.createdById,
    approvedById: order.approvedById,
    supplier: order.supplier,
    warehouse: order.warehouse,
    totalAmount: decimalToString(total),
    items: order.items.map((item) => ({
      id: item.id,
      organizationId: item.organizationId,
      productId: item.productId,
      quantity: item.quantity,
      receivedQty: item.receivedQty,
      unitCost: decimalToString(item.unitCost),
      lineTotal: decimalToString(toDecimal(item.unitCost).mul(item.quantity)),
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

async function loadOrder(organizationId: string, id: string) {
  const order = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, { _id: id, organizationId });
  if (!order) throw notFound('Purchase order not found');
  const [view] = await hydrate([order]);
  if (!view) throw notFound('Purchase order not found');
  return view;
}

export async function listPurchaseOrders(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.purchaseOrders, filter),
    findMany<PurchaseOrderDoc>(cols.purchaseOrders, filter, {
      sort: { createdAt: -1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }).then(hydrate),
  ]);
  return { items: rows.map(toPurchaseOrder), pagination: toPagination(query.page, query.limit, total) };
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await loadOrder(organizationId, id);
  const audits = await findMany<AuditLogDoc>(
    cols.auditLogs,
    { organizationId, entityType: 'PurchaseOrder', entityId: id },
    { sort: { createdAt: 1 } },
  );
  const users = await mapByIds<UserDoc>(
    cols.users,
    audits.map((entry) => entry.userId).filter((userId): userId is string => Boolean(userId)),
  );
  return {
    ...toPurchaseOrder(order),
    timeline: audits.map((entry) => {
      const user = entry.userId ? users.get(entry.userId) : undefined;
      return {
        id: entry.id,
        action: entry.action,
        at: entry.createdAt,
        actor: user ? { id: user.id, name: user.name, email: user.email } : null,
        metadata: entry.metadata,
      };
    }),
  };
}

function lineItems(organizationId: string, input: CreateBody, productById: Map<string, ProductDoc>): PurchaseOrderItemDoc[] {
  return input.items.map((item) => {
    const product = productById.get(item.productId);
    return {
      id: newId(),
      organizationId,
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost ?? product?.unitCost ?? '0.00',
      receivedQty: 0,
    };
  });
}

export async function createPurchaseOrder(organizationId: string, userId: string, input: CreateBody) {
  const supplier = await findOne<SupplierDoc>(cols.suppliers, { _id: input.supplierId, organizationId });
  const warehouse = await findOne<WarehouseDoc>(cols.warehouses, { _id: input.warehouseId, organizationId });
  const products = await findMany<ProductDoc>(cols.products, {
    organizationId,
    _id: { $in: input.items.map((item) => item.productId) },
  });
  if (!supplier) throw notFound('Supplier not found');
  if (!warehouse) throw notFound('Warehouse not found');
  if (products.length !== input.items.length) throw notFound('One or more products were not found');

  if (input.recommendationId) {
    const recommendation = await findOne<RecommendationDoc>(cols.recommendations, {
      _id: input.recommendationId,
      organizationId,
    });
    if (!recommendation) throw notFound('Recommendation not found');
    if (recommendation.status !== RecommendationStatus.APPROVED) {
      throw conflict('RECOMMENDATION_NOT_APPROVED', 'Purchase orders can only be linked to approved recommendations');
    }
    if (recommendation.warehouseId !== input.warehouseId) {
      throw conflict('WAREHOUSE_MISMATCH', 'Recommendation warehouse does not match this order');
    }
    if (!input.items.some((item) => item.productId === recommendation.productId)) {
      throw conflict('PRODUCT_MISMATCH', 'Recommendation product must be included on the order');
    }
    const linked = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, {
      organizationId,
      recommendationId: recommendation.id,
    });
    if (linked) {
      throw conflict('RECOMMENDATION_ALREADY_ORDERED', 'This recommendation already has a purchase order');
    }
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const order = await withTransaction(async () => {
    const created = await insertOne<PurchaseOrderDoc>(cols.purchaseOrders, {
      organizationId,
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      ...(input.recommendationId ? { recommendationId: input.recommendationId } : { recommendationId: null }),
      poNumber: createPoNumber(),
      status: PurchaseOrderStatus.DRAFT,
      notes: input.notes ?? null,
      expectedAt: input.expectedAt ?? null,
      createdById: userId,
      approvedById: null,
      orderedAt: null,
      items: lineItems(organizationId, input, productById),
    });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.PURCHASE_ORDER_CREATED,
      entityType: 'PurchaseOrder',
      entityId: created.id,
      metadata: { poNumber: created.poNumber, status: created.status },
    });
    return created;
  });

  const [view] = await hydrate([order]);
  return toPurchaseOrder(view ?? { ...order, supplier, warehouse });
}

export async function updatePurchaseOrder(
  organizationId: string,
  userId: string,
  role: UserRole,
  id: string,
  input: UpdateBody,
) {
  const existing = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, { _id: id, organizationId });
  if (!existing) throw notFound('Purchase order not found');

  if (
    (existing.status === PurchaseOrderStatus.RECEIVED || existing.status === PurchaseOrderStatus.CANCELLED) &&
    (input.status || input.notes !== undefined || input.expectedAt !== undefined)
  ) {
    throw conflict('PO_CLOSED', 'Closed purchase orders cannot be modified');
  }

  if (input.status) {
    const allowed = TRANSITIONS[existing.status];
    if (!allowed.includes(input.status)) {
      throw conflict('INVALID_TRANSITION', `Cannot move a purchase order from ${existing.status} to ${input.status}`);
    }
    if (input.status === PurchaseOrderStatus.APPROVED && !can(role, 'purchase_orders', 'approve')) {
      throw forbidden('Only owners and admins can approve purchase orders');
    }
  }

  const order = await withTransaction(async () => {
    const updated = await patchOne(
      cols.purchaseOrders,
      { _id: id, organizationId, status: existing.status },
      {
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
        ...(input.status === PurchaseOrderStatus.APPROVED ? { approvedById: userId } : {}),
        ...(input.status === PurchaseOrderStatus.SENT && !existing.orderedAt ? { orderedAt: new Date() } : {}),
      },
    );
    if (updated === 0) {
      throw conflict('INVALID_TRANSITION', 'Purchase order status changed before this update');
    }
    const fresh = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, { _id: id, organizationId });
    if (!fresh) throw notFound('Purchase order not found');
    const statusChanged = Boolean(input.status) && input.status !== existing.status;
    await recordAudit({
      organizationId,
      userId,
      action: !statusChanged
        ? AuditAction.PURCHASE_ORDER_UPDATED
        : input.status === PurchaseOrderStatus.APPROVED
          ? AuditAction.PURCHASE_ORDER_APPROVED
          : AuditAction.PURCHASE_ORDER_STATUS_CHANGED,
      entityType: 'PurchaseOrder',
      entityId: id,
      metadata: { from: existing.status, to: fresh.status, poNumber: fresh.poNumber },
    });
    return fresh;
  });

  if (input.status === PurchaseOrderStatus.APPROVED) {
    void publishEvent({
      name: DomainEventName.PO_APPROVED,
      organizationId,
      entityType: 'PurchaseOrder',
      entityId: order.id,
      payload: { poNumber: order.poNumber },
    });
  }

  const [view] = await hydrate([order]);
  return toPurchaseOrder(view ?? order);
}

async function addStock(organizationId: string, productId: string, warehouseId: string, quantity: number) {
  const existing = await findOne<InventoryDoc>(cols.inventory, { productId, warehouseId });
  if (existing) {
    const matched = await patchOne(cols.inventory, { _id: existing.id, organizationId }, {}, { $inc: { quantity } });
    if (matched === 0) throw notFound('Inventory position not found');
    return;
  }
  await insertOne<InventoryDoc>(cols.inventory, {
    organizationId,
    productId,
    warehouseId,
    quantity,
    reservedQty: 0,
    reorderPoint: 0,
  });
}

export async function receivePurchaseOrder(organizationId: string, userId: string, id: string, input: ReceiveBody) {
  const order = await withTransaction(async () => {
    const existing = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, { _id: id, organizationId });
    if (!existing) throw notFound('Purchase order not found');
    if (existing.status !== PurchaseOrderStatus.SENT && existing.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED) {
      throw conflict('INVALID_STATUS', 'Goods can only be received after the purchase order has been sent');
    }

    const items = existing.items.map((item) => ({ ...item }));
    const seen = new Set<string>();
    for (const line of input.items) {
      if (seen.has(line.purchaseOrderItemId)) {
        throw conflict('DUPLICATE_RECEIPT_LINE', 'Each purchase order line can be received once per request');
      }
      seen.add(line.purchaseOrderItemId);
      const item = items.find((candidate) => candidate.id === line.purchaseOrderItemId && candidate.organizationId === organizationId);
      if (!item) throw notFound('Purchase order item not found');
      if (item.receivedQty + line.quantity > item.quantity) {
        throw conflict('OVER_RECEIPT', 'Received quantity exceeds the ordered quantity');
      }
      item.receivedQty += line.quantity;
      await addStock(organizationId, item.productId, existing.warehouseId, line.quantity);
    }

    const fullyReceived = items.every((item) => item.receivedQty >= item.quantity);
    const status = fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED;
    const matched = await patchOne(
      cols.purchaseOrders,
      { _id: existing.id, organizationId },
      { status, items },
    );
    if (matched === 0) throw notFound('Purchase order not found');
    const fresh = await findOne<PurchaseOrderDoc>(cols.purchaseOrders, { _id: existing.id, organizationId });
    if (!fresh) throw notFound('Purchase order not found');

    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.PURCHASE_ORDER_RECEIVED,
      entityType: 'PurchaseOrder',
      entityId: existing.id,
      metadata: { poNumber: existing.poNumber, status, lines: input.items.length },
    });
    return fresh;
  });

  void publishEvent({
    name: DomainEventName.PO_RECEIVED,
    organizationId,
    entityType: 'PurchaseOrder',
    entityId: order.id,
    payload: { status: order.status },
  });

  const [view] = await hydrate([order]);
  return toPurchaseOrder(view ?? order);
}
