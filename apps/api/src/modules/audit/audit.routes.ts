import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import { listAudit } from './audit.controller';
import { listAuditSchema } from './audit.schema';

export const auditRouter = Router();

auditRouter.use(requireAuth);
auditRouter.get('/', requirePermission('audit', 'read'), validate(listAuditSchema), listAudit);
