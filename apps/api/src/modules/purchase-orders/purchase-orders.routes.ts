import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as purchaseOrderController from './purchase-orders.controller';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  purchaseOrderIdSchema,
  receivePurchaseOrderSchema,
  updatePurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
} from './purchase-orders.schema';

export const purchaseOrderRouter = Router();

purchaseOrderRouter.use(requireAuth);
purchaseOrderRouter.get(
  '/',
  requirePermission('purchase_orders', 'read'),
  validate(listPurchaseOrdersSchema),
  purchaseOrderController.listPurchaseOrders,
);
purchaseOrderRouter.post(
  '/',
  requirePermission('purchase_orders', 'write'),
  validate(createPurchaseOrderSchema),
  purchaseOrderController.createPurchaseOrder,
);
purchaseOrderRouter.get(
  '/:id',
  requirePermission('purchase_orders', 'read'),
  validate(purchaseOrderIdSchema),
  purchaseOrderController.getPurchaseOrder,
);
purchaseOrderRouter.patch(
  '/:id/status',
  requirePermission('purchase_orders', 'write'),
  validate(updatePurchaseOrderStatusSchema),
  purchaseOrderController.updatePurchaseOrderStatus,
);
purchaseOrderRouter.patch(
  '/:id',
  requirePermission('purchase_orders', 'write'),
  validate(updatePurchaseOrderSchema),
  purchaseOrderController.updatePurchaseOrder,
);
purchaseOrderRouter.post(
  '/:id/receive',
  requirePermission('purchase_orders', 'write'),
  validate(receivePurchaseOrderSchema),
  purchaseOrderController.receivePurchaseOrder,
);
