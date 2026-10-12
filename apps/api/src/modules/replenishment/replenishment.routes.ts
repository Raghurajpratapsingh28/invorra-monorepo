import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as replenishmentController from './replenishment.controller';
import {
  approveRecommendationSchema,
  generateRecommendationsSchema,
  listRecommendationsSchema,
  recommendationIdSchema,
  rejectRecommendationSchema,
} from './replenishment.schema';

export const replenishmentRouter = Router();

replenishmentRouter.use(requireAuth);
replenishmentRouter.get(
  '/',
  requirePermission('replenishment', 'read'),
  validate(listRecommendationsSchema),
  replenishmentController.listRecommendations,
);
replenishmentRouter.get(
  '/:id',
  requirePermission('replenishment', 'read'),
  validate(recommendationIdSchema),
  replenishmentController.getRecommendation,
);
replenishmentRouter.post(
  '/generate',
  requirePermission('replenishment', 'write'),
  validate(generateRecommendationsSchema),
  replenishmentController.generateRecommendations,
);
replenishmentRouter.post(
  '/:id/approve',
  requirePermission('replenishment', 'approve'),
  validate(approveRecommendationSchema),
  replenishmentController.approveRecommendation,
);
replenishmentRouter.post(
  '/:id/reject',
  requirePermission('replenishment', 'approve'),
  validate(rejectRecommendationSchema),
  replenishmentController.rejectRecommendation,
);
