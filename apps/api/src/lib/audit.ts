import { cols, insertOne } from '../db/mongo';
import type { AuditLogDoc } from '../domain/documents';
import { requestContext } from './request-context';

export const AuditAction = {
  ORG_REGISTERED: 'ORG_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  WAREHOUSE_CREATED: 'WAREHOUSE_CREATED',
  WAREHOUSE_UPDATED: 'WAREHOUSE_UPDATED',
  WAREHOUSE_DELETED: 'WAREHOUSE_DELETED',
  INVENTORY_CREATED: 'INVENTORY_CREATED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  SALE_RECORDED: 'SALE_RECORDED',
  SUPPLIER_CREATED: 'SUPPLIER_CREATED',
  SUPPLIER_UPDATED: 'SUPPLIER_UPDATED',
  SUPPLIER_DELETED: 'SUPPLIER_DELETED',
  FORECAST_CREATED: 'FORECAST_CREATED',
  FORECAST_GENERATED: 'FORECAST_GENERATED',
  RECOMMENDATION_GENERATED: 'RECOMMENDATION_GENERATED',
  RECOMMENDATION_CREATED: 'RECOMMENDATION_CREATED',
  RECOMMENDATION_APPROVED: 'RECOMMENDATION_APPROVED',
  RECOMMENDATION_REJECTED: 'RECOMMENDATION_REJECTED',
  PURCHASE_ORDER_CREATED: 'PURCHASE_ORDER_CREATED',
  PURCHASE_ORDER_UPDATED: 'PURCHASE_ORDER_UPDATED',
  PURCHASE_ORDER_APPROVED: 'PURCHASE_ORDER_APPROVED',
  PURCHASE_ORDER_STATUS_CHANGED: 'PURCHASE_ORDER_STATUS_CHANGED',
  PURCHASE_ORDER_RECEIVED: 'PURCHASE_ORDER_RECEIVED',
} as const;

export async function recordAudit(entry: {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}): Promise<void> {
  await insertOne<AuditLogDoc>(cols.auditLogs, {
    organizationId: entry.organizationId,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ipAddress ?? requestContext.getStore()?.ip ?? null,
  });
}
