import { z } from 'zod';
import { asyncHandler } from '../../utils/async-handler';
import { sendSuccess } from '../../utils/api-response';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  createProductSchema,
  listProductsSchema,
  productIdSchema,
  updateProductSchema,
} from './products.schema';
import * as productService from './products.service';

export const listProducts = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listProductsSchema>>(req);
  const result = await productService.listProducts(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const createProduct = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createProductSchema>>(req);
  const product = await productService.createProduct(user.organizationId, user.userId, body);
  sendSuccess(res, product, 201);
});

export const getProduct = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof productIdSchema>>(req);
  const product = await productService.getProduct(user.organizationId, params.id);
  sendSuccess(res, product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof updateProductSchema>>(req);
  const product = await productService.updateProduct(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof productIdSchema>>(req);
  const result = await productService.deleteProduct(user.organizationId, user.userId, params.id);
  sendSuccess(res, result);
});
