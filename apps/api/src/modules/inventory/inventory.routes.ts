import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as inventoryController from './inventory.controller';
import {
  createInventorySchema,
  inventoryIdSchema,
  inventoryRisksSchema,
  listInventorySchema,
  updateInventorySchema,
} from './inventory.schema';

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);
inventoryRouter.get(
  '/',
  requirePermission('inventory', 'read'),
  validate(listInventorySchema),
  inventoryController.listInventory,
);
inventoryRouter.get(
  '/risks',
  requirePermission('inventory', 'read'),
  validate(inventoryRisksSchema),
  inventoryController.listRisks,
);
inventoryRouter.get(
  '/:id',
  requirePermission('inventory', 'read'),
  validate(inventoryIdSchema),
  inventoryController.getInventory,
);
inventoryRouter.post(
  '/',
  requirePermission('inventory', 'write'),
  validate(createInventorySchema),
  inventoryController.createInventory,
);
inventoryRouter.patch(
  '/:id',
  requirePermission('inventory', 'write'),
  validate(updateInventorySchema),
  inventoryController.updateInventory,
);
