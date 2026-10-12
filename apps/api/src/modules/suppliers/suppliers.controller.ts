import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  createSupplierSchema,
  listSuppliersSchema,
  supplierIdSchema,
  updateSupplierSchema,
} from './suppliers.schema';
import * as supplierService from './suppliers.service';

export const listSuppliers = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listSuppliersSchema>>(req);
  const result = await supplierService.listSuppliers(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const createSupplier = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createSupplierSchema>>(req);
  const supplier = await supplierService.createSupplier(user.organizationId, user.userId, body);
  sendSuccess(res, supplier, 201);
});

export const getSupplier = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof supplierIdSchema>>(req);
  const supplier = await supplierService.getSupplier(user.organizationId, params.id);
  sendSuccess(res, supplier);
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updateSupplierSchema>>(req);
  const supplier = await supplierService.updateSupplier(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, supplier);
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof supplierIdSchema>>(req);
  const result = await supplierService.deleteSupplier(user.organizationId, user.userId, params.id);
  sendSuccess(res, result);
});
