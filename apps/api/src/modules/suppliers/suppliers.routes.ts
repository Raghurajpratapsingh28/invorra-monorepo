import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as supplierController from './suppliers.controller';
import {
  createSupplierSchema,
  listSuppliersSchema,
  supplierIdSchema,
  updateSupplierSchema,
} from './suppliers.schema';

export const supplierRouter = Router();

supplierRouter.use(requireAuth);
supplierRouter.get(
  '/',
  requirePermission('suppliers', 'read'),
  validate(listSuppliersSchema),
  supplierController.listSuppliers,
);
supplierRouter.post(
  '/',
  requirePermission('suppliers', 'write'),
  validate(createSupplierSchema),
  supplierController.createSupplier,
);
supplierRouter.get(
  '/:id',
  requirePermission('suppliers', 'read'),
  validate(supplierIdSchema),
  supplierController.getSupplier,
);
supplierRouter.patch(
  '/:id',
  requirePermission('suppliers', 'write'),
  validate(updateSupplierSchema),
  supplierController.updateSupplier,
);
supplierRouter.delete(
  '/:id',
  requirePermission('suppliers', 'delete'),
  validate(supplierIdSchema),
  supplierController.deleteSupplier,
);
