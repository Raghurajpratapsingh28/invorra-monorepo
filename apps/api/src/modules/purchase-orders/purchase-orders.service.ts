import { Prisma, PurchaseOrderStatus, UserRole } from '@prisma/client';
import { z } from 'zod';
import { can } from '../../config/permissions';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
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

const detailInclude = {
  items: true,
  supplier: { select: { id: true, name: true, code: true } },
  warehouse: { select: { id: true, name: true, code: true, city: true } },
} satisfies Prisma.PurchaseOrderInclude;

type PurchaseOrderDetail = Prisma.PurchaseOrderGetPayload<{ include: typeof detailInclude }>;

export function toPurchaseOrder(order: PurchaseOrderDetail) {
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
  const order = await prisma.purchaseOrder.findFirst({
    where: { id, organizationId },
    include: detailInclude,
  });
  if (!order) {
    throw notFound('Purchase order not found');
  }
  return order;
}

export async function listPurchaseOrders(organizationId: string, query: ListQuery) {
  const where: Prisma.PurchaseOrderWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      include: detailInclude,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toPurchaseOrder),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function getPurchaseOrder(organizationId: string, id: string) {
  const order = await loadOrder(organizationId, id);
  const audits = await prisma.auditLog.findMany({
    where: { organizationId, entityType: 'PurchaseOrder', entityId: id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return {
    ...toPurchaseOrder(order),
    timeline: audits.map((entry) => ({
      id: entry.id,
      action: entry.action,
      at: entry.createdAt,
      actor: entry.user,
      metadata: entry.metadata,
    })),
  };
}

export async function createPurchaseOrder(
  organizationId: string,
  userId: string,
  input: CreateBody,
) {
  const [supplier, warehouse, products] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, organizationId } }),
    prisma.warehouse.findFirst({ where: { id: input.warehouseId, organizationId } }),
    prisma.product.findMany({
      where: { organizationId, id: { in: input.items.map((item) => item.productId) } },
    }),
  ]);

  if (!supplier) {
    throw notFound('Supplier not found');
  }
  if (!warehouse) {
    throw notFound('Warehouse not found');
  }
  if (products.length !== input.items.length) {
    throw notFound('One or more products were not found');
  }

  if (input.recommendationId) {
    const recommendation = await prisma.replenishmentRecommendation.findFirst({
      where: { id: input.recommendationId, organizationId },
    });
    if (!recommendation) {
      throw notFound('Recommendation not found');
    }
    if (recommendation.status !== 'APPROVED') {
      throw conflict(
        'RECOMMENDATION_NOT_APPROVED',
        'Purchase orders can only be linked to approved recommendations',
      );
    }
    if (recommendation.warehouseId !== input.warehouseId) {
      throw conflict('WAREHOUSE_MISMATCH', 'Recommendation warehouse does not match this order');
    }
    if (!input.items.some((item) => item.productId === recommendation.productId)) {
      throw conflict('PRODUCT_MISMATCH', 'Recommendation product must be included on the order');
    }
    const linked = await prisma.purchaseOrder.findFirst({
      where: { organizationId, recommendationId: recommendation.id },
      select: { id: true },
    });
    if (linked) {
      throw conflict('RECOMMENDATION_ALREADY_ORDERED', 'This recommendation already has a purchase order');
    }
  }

  const productById = new Map(products.map((product) => [product.id, product]));
  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        organizationId,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        recommendationId: input.recommendationId ?? null,
        poNumber: createPoNumber(),
        status: 'DRAFT',
        notes: input.notes ?? null,
        expectedAt: input.expectedAt ?? null,
        createdById: userId,
        items: {
          create: input.items.map((item) => {
            const product = productById.get(item.productId);
            return {
              organizationId,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost ?? product?.unitCost ?? '0.00',
            };
          }),
        },
      },
      include: detailInclude,
    });

    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.PURCHASE_ORDER_CREATED,
      entityType: 'PurchaseOrder',
      entityId: created.id,
      metadata: { poNumber: created.poNumber, status: created.status },
    });
    return created;
  });

  return toPurchaseOrder(order);
}

export async function updatePurchaseOrder(
  organizationId: string,
  userId: string,
  role: UserRole,
  id: string,
  input: UpdateBody,
) {
  const existing = await prisma.purchaseOrder.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw notFound('Purchase order not found');
  }

  if (
    (existing.status === 'RECEIVED' || existing.status === 'CANCELLED') &&
    (input.status || input.notes !== undefined || input.expectedAt !== undefined)
  ) {
    throw conflict('PO_CLOSED', 'Closed purchase orders cannot be modified');
  }

  if (input.status) {
    const allowed = TRANSITIONS[existing.status];
    if (!allowed.includes(input.status)) {
      throw conflict(
        'INVALID_TRANSITION',
        `Cannot move a purchase order from ${existing.status} to ${input.status}`,
      );
    }
    if (input.status === 'APPROVED' && !can(role, 'purchase_orders', 'approve')) {
      throw forbidden('Only owners and admins can approve purchase orders');
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.updateMany({
      where: { id, organizationId, status: existing.status },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
        ...(input.status === 'APPROVED' ? { approvedById: userId } : {}),
        ...(input.status === 'SENT' && !existing.orderedAt ? { orderedAt: new Date() } : {}),
      },
    });
    if (updated.count === 0) {
      throw conflict('INVALID_TRANSITION', 'Purchase order status changed before this update');
    }
    const fresh = await tx.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: detailInclude,
    });
    if (!fresh) {
      throw notFound('Purchase order not found');
    }
    const statusChanged = Boolean(input.status) && input.status !== existing.status;
    await recordAudit(tx, {
      organizationId,
      userId,
      action: !statusChanged
        ? AuditAction.PURCHASE_ORDER_UPDATED
        : input.status === 'APPROVED'
          ? AuditAction.PURCHASE_ORDER_APPROVED
          : AuditAction.PURCHASE_ORDER_STATUS_CHANGED,
      entityType: 'PurchaseOrder',
      entityId: id,
      metadata: { from: existing.status, to: fresh.status, poNumber: fresh.poNumber },
    });
    return fresh;
  });

  if (input.status === 'APPROVED') {
    void publishEvent({
      name: DomainEventName.PO_APPROVED,
      organizationId,
      entityType: 'PurchaseOrder',
      entityId: order.id,
      payload: { poNumber: order.poNumber },
    });
  }

  return toPurchaseOrder(order);
}

export async function receivePurchaseOrder(
  organizationId: string,
  userId: string,
  id: string,
  input: ReceiveBody,
) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!existing) {
      throw notFound('Purchase order not found');
    }
    if (
      existing.status !== PurchaseOrderStatus.SENT &&
      existing.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw conflict(
        'INVALID_STATUS',
        'Goods can only be received after the purchase order has been sent',
      );
    }

    const itemIds = new Set<string>();
    for (const line of input.items) {
      if (itemIds.has(line.purchaseOrderItemId)) {
        throw conflict('DUPLICATE_RECEIPT_LINE', 'Each purchase order line can be received once per request');
      }
      itemIds.add(line.purchaseOrderItemId);

      const item = existing.items.find(
        (candidate) =>
          candidate.id === line.purchaseOrderItemId && candidate.organizationId === organizationId,
      );
      if (!item) {
        throw notFound('Purchase order item not found');
      }
      if (item.receivedQty + line.quantity > item.quantity) {
        throw conflict('OVER_RECEIPT', 'Received quantity exceeds the ordered quantity');
      }

      const updated = await tx.purchaseOrderItem.updateMany({
        where: { id: item.id, organizationId, purchaseOrderId: existing.id },
        data: { receivedQty: { increment: line.quantity } },
      });
      if (updated.count === 0) {
        throw notFound('Purchase order item not found');
      }

      await tx.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: item.productId,
            warehouseId: existing.warehouseId,
          },
        },
        create: {
          organizationId,
          productId: item.productId,
          warehouseId: existing.warehouseId,
          quantity: line.quantity,
        },
        update: { quantity: { increment: line.quantity } },
      });
    }

    const freshItems = await tx.purchaseOrderItem.findMany({
      where: { purchaseOrderId: existing.id, organizationId },
    });
    const fullyReceived = freshItems.every((item) => item.receivedQty >= item.quantity);
    const status = fullyReceived
      ? PurchaseOrderStatus.RECEIVED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    await tx.purchaseOrder.updateMany({
      where: { id: existing.id, organizationId },
      data: { status },
    });

    const fresh = await tx.purchaseOrder.findFirst({
      where: { id: existing.id, organizationId },
      include: detailInclude,
    });
    if (!fresh) {
      throw notFound('Purchase order not found');
    }

    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.PURCHASE_ORDER_RECEIVED,
      entityType: 'PurchaseOrder',
      entityId: existing.id,
      metadata: {
        poNumber: existing.poNumber,
        status,
        lines: input.items.length,
      },
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

  return toPurchaseOrder(order);
}
