import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as warehouseController from './warehouses.controller';
import {
  createWarehouseSchema,
  listWarehousesSchema,
  updateWarehouseSchema,
  warehouseIdSchema,
} from './warehouses.schema';

export const warehouseRouter = Router();

warehouseRouter.use(requireAuth);
warehouseRouter.get(
  '/',
  requirePermission('warehouses', 'read'),
  validate(listWarehousesSchema),
  warehouseController.listWarehouses,
);
warehouseRouter.post(
  '/',
  requirePermission('warehouses', 'write'),
  validate(createWarehouseSchema),
  warehouseController.createWarehouse,
);
warehouseRouter.get(
  '/:id',
  requirePermission('warehouses', 'read'),
  validate(warehouseIdSchema),
  warehouseController.getWarehouse,
);
warehouseRouter.patch(
  '/:id',
  requirePermission('warehouses', 'write'),
  validate(updateWarehouseSchema),
  warehouseController.updateWarehouse,
);
warehouseRouter.delete(
  '/:id',
  requirePermission('warehouses', 'delete'),
  validate(warehouseIdSchema),
  warehouseController.deleteWarehouse,
);
