import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  createInventorySchema,
  inventoryIdSchema,
  inventoryRisksSchema,
  listInventorySchema,
  updateInventorySchema,
} from './inventory.schema';
import * as inventoryService from './inventory.service';

export const listInventory = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listInventorySchema>>(req);
  const result = await inventoryService.listInventory(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const listRisks = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof inventoryRisksSchema>>(req);
  const result = await inventoryService.listRisks(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const getInventory = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof inventoryIdSchema>>(req);
  const row = await inventoryService.getInventory(user.organizationId, params.id);
  sendSuccess(res, row);
});

export const createInventory = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createInventorySchema>>(req);
  const row = await inventoryService.createInventory(user.organizationId, user.userId, body);
  sendSuccess(res, row, 201);
});

export const updateInventory = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updateInventorySchema>>(req);
  const row = await inventoryService.updateInventory(
    user.organizationId,
    user.userId,
    user.role,
    params.id,
    body,
  );
  sendSuccess(res, row);
});
