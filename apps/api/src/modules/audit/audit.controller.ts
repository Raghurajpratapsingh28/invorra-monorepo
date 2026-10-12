import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import { listAuditSchema } from './audit.schema';
import { listAuditLogs } from './audit.service';

export const listAudit = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listAuditSchema>>(req);
  const result = await listAuditLogs(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});
