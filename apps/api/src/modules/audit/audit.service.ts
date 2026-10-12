import { z } from 'zod';
import { cols, countDocs, findMany, mapByIds } from '../../db/mongo';
import type { AuditLogDoc, UserDoc } from '../../domain/documents';
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
  const filter = {
    organizationId,
    ...(action ? { action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.entityId ? { entityId: query.entityId } : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.auditLogs, filter),
    findMany<AuditLogDoc>(cols.auditLogs, filter, {
      sort: { createdAt: -1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }),
  ]);
  const users = await mapByIds<UserDoc>(
    cols.users,
    rows.map((row) => row.userId).filter((id): id is string => Boolean(id)),
  );
  return {
    items: rows.map((row) => {
      const user = row.userId ? users.get(row.userId) : undefined;
      return {
        id: row.id,
        organizationId: row.organizationId,
        userId: row.userId,
        user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt,
      };
    }),
    pagination: toPagination(query.page, query.limit, total),
  };
}
