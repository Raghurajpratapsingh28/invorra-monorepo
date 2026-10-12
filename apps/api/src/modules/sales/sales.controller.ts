import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import { createSaleSchema, importSalesSchema, listSalesSchema } from './sales.schema';
import * as salesService from './sales.service';

export const listSales = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listSalesSchema>>(req);
  const result = await salesService.listSales(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const importSales = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof importSalesSchema>>(req);
  const result = await salesService.importSales(user.organizationId, user.userId, user.role, body.csv);
  sendSuccess(res, result, 201);
});

export const createSale = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createSaleSchema>>(req);
  const sale = await salesService.recordSale(user.organizationId, user.userId, user.role, body);
  sendSuccess(res, sale, 201);
});
