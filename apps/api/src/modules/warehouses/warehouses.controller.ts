import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  createWarehouseSchema,
  listWarehousesSchema,
  updateWarehouseSchema,
  warehouseIdSchema,
} from './warehouses.schema';
import * as warehouseService from './warehouses.service';

export const listWarehouses = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listWarehousesSchema>>(req);
  const result = await warehouseService.listWarehouses(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const createWarehouse = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createWarehouseSchema>>(req);
  const warehouse = await warehouseService.createWarehouse(user.organizationId, user.userId, body);
  sendSuccess(res, warehouse, 201);
});

export const getWarehouse = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof warehouseIdSchema>>(req);
  const warehouse = await warehouseService.getWarehouse(user.organizationId, params.id);
  sendSuccess(res, warehouse);
});

export const updateWarehouse = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updateWarehouseSchema>>(req);
  const warehouse = await warehouseService.updateWarehouse(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, warehouse);
});

export const deleteWarehouse = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof warehouseIdSchema>>(req);
  const result = await warehouseService.deleteWarehouse(user.organizationId, user.userId, params.id);
  sendSuccess(res, result);
});
