import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as productController from './products.controller';
import {
  createProductSchema,
  listProductsSchema,
  productIdSchema,
  updateProductSchema,
} from './products.schema';

export const productRouter = Router();

productRouter.use(requireAuth);
productRouter.get(
  '/',
  requirePermission('products', 'read'),
  validate(listProductsSchema),
  productController.listProducts,
);
productRouter.post(
  '/',
  requirePermission('products', 'write'),
  validate(createProductSchema),
  productController.createProduct,
);
productRouter.get(
  '/:id',
  requirePermission('products', 'read'),
  validate(productIdSchema),
  productController.getProduct,
);
productRouter.patch(
  '/:id',
  requirePermission('products', 'write'),
  validate(updateProductSchema),
  productController.updateProduct,
);
productRouter.delete(
  '/:id',
  requirePermission('products', 'delete'),
  validate(productIdSchema),
  productController.deleteProduct,
);
