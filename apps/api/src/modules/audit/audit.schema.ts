import { z } from 'zod';
import { idSchema, paginationFields } from '../../utils/zod';

export const listAuditSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      action: z.string().trim().min(1).max(80).optional(),
      entityType: z.string().trim().min(1).max(80).optional(),
      entityId: idSchema.optional(),
    })
    .strict(),
});
