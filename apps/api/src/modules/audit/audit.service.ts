import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { toPagination, toSkip } from '../../utils/pagination';
import type { listAuditSchema } from './audit.schema';

type ListQuery = z.infer<typeof listAuditSchema>['query'];

const actionAliases: Record<string, string> = {
  LOGIN: 'USER_LOGIN',
  LOGOUT: 'USER_LOGOUT',
  RECOMMENDATION_CREATED: 'RECOMMENDATION_CREATED',
  PO_CREATED: 'PURCHASE_ORDER_CREATED',
  PO_APPROVED: 'PURCHASE_ORDER_APPROVED',
  PO_STATUS_CHANGED: 'PURCHASE_ORDER_STATUS_CHANGED',
  PO_RECEIVED: 'PURCHASE_ORDER_RECEIVED',
};

export async function listAuditLogs(organizationId: string, query: ListQuery) {
  const action = query.action ? actionAliases[query.action] ?? query.action : undefined;
  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    ...(action ? { action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: toSkip(query.page, query.limit),
      take: query.limit,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      user: row.user,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt,
    })),
    pagination: toPagination(query.page, query.limit, total),
  };
}
