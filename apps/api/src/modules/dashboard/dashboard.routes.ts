import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import {
  getInventoryHealthChart,
  getSales,
  getStockoutRiskTable,
  getSummary,
} from './dashboard.controller';
import { salesSeriesSchema, summarySchema } from './dashboard.schema';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get(
  '/summary',
  requirePermission('analytics', 'read'),
  validate(summarySchema),
  getSummary,
);
dashboardRouter.get(
  '/sales',
  requirePermission('analytics', 'read'),
  validate(salesSeriesSchema),
  getSales,
);
dashboardRouter.get(
  '/inventory-health',
  requirePermission('analytics', 'read'),
  getInventoryHealthChart,
);
dashboardRouter.get(
  '/stockout-risks',
  requirePermission('analytics', 'read'),
  getStockoutRiskTable,
);
