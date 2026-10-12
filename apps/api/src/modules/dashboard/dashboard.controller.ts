import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  getDashboardSummary,
  getInventoryHealthSummary,
  getSalesSeries,
  getStockoutRisks,
} from './dashboard.service';
import { salesSeriesSchema, summarySchema } from './dashboard.schema';

export const getSummary = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof summarySchema>>(req);
  const summary = await getDashboardSummary(user.organizationId, query.days);
  sendSuccess(res, summary);
});

export const getSales = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof salesSeriesSchema>>(req);
  const series = await getSalesSeries(user.organizationId, query.days);
  sendSuccess(res, series);
});

export const getInventoryHealthChart = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const summary = await getInventoryHealthSummary(user.organizationId);
  sendSuccess(res, summary);
});

export const getStockoutRiskTable = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const rows = await getStockoutRisks(user.organizationId);
  sendSuccess(res, rows);
});
