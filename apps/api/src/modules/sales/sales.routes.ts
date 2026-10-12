import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as salesController from './sales.controller';
import { createSaleSchema, importSalesSchema, listSalesSchema } from './sales.schema';

export const salesRouter = Router();

salesRouter.use(requireAuth);
salesRouter.get(
  '/',
  requirePermission('sales', 'read'),
  validate(listSalesSchema),
  salesController.listSales,
);
salesRouter.post(
  '/import',
  requirePermission('sales', 'write'),
  validate(importSalesSchema),
  salesController.importSales,
);
salesRouter.post(
  '/',
  requirePermission('sales', 'write'),
  validate(createSaleSchema),
  salesController.createSale,
);
