import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as assistantController from './assistant.controller';
import { chatSchema, confirmSchema, explainSchema } from './assistant.schema';

export const assistantRouter = Router();

assistantRouter.use(requireAuth);
assistantRouter.post(
  '/chat',
  requirePermission('analytics', 'read'),
  validate(chatSchema),
  assistantController.chat,
);
assistantRouter.post(
  '/confirm',
  requirePermission('replenishment', 'approve'),
  validate(confirmSchema),
  assistantController.confirm,
);
assistantRouter.post(
  '/explain',
  requirePermission('analytics', 'read'),
  validate(explainSchema),
  assistantController.explain,
);
