import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  purchaseOrderIdSchema,
  receivePurchaseOrderSchema,
  updatePurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
} from './purchase-orders.schema';
import * as purchaseOrderService from './purchase-orders.service';

export const listPurchaseOrders = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listPurchaseOrdersSchema>>(req);
  const result = await purchaseOrderService.listPurchaseOrders(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const createPurchaseOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createPurchaseOrderSchema>>(req);
  const order = await purchaseOrderService.createPurchaseOrder(
    user.organizationId,
    user.userId,
    body,
  );
  sendSuccess(res, order, 201);
});

export const getPurchaseOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof purchaseOrderIdSchema>>(req);
  const order = await purchaseOrderService.getPurchaseOrder(user.organizationId, params.id);
  sendSuccess(res, order);
});

export const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updatePurchaseOrderSchema>>(req);
  const order = await purchaseOrderService.updatePurchaseOrder(
    user.organizationId,
    user.userId,
    user.role,
    params.id,
    body,
  );
  sendSuccess(res, order);
});

export const updatePurchaseOrderStatus = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updatePurchaseOrderStatusSchema>>(req);
  const order = await purchaseOrderService.updatePurchaseOrder(
    user.organizationId,
    user.userId,
    user.role,
    params.id,
    { status: body.status },
  );
  sendSuccess(res, order);
});

export const receivePurchaseOrder = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof receivePurchaseOrderSchema>>(req);
  const order = await purchaseOrderService.receivePurchaseOrder(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, order);
});
