import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import { createForecastSchema, forecastIdSchema, listForecastsSchema } from './forecasts.schema';
import * as forecastService from './forecasts.service';

export const listForecasts = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listForecastsSchema>>(req);
  const result = await forecastService.listForecasts(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const createForecast = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body } = getValidated<z.infer<typeof createForecastSchema>>(req);
  const forecast = await forecastService.createForecast(user.organizationId, user.userId, body);
  sendSuccess(res, forecast, 201);
});

export const getForecast = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof forecastIdSchema>>(req);
  const forecast = await forecastService.getForecast(user.organizationId, params.id);
  sendSuccess(res, forecast);
});

export const getForecastModel = asyncHandler(async (_req, res) => {
  const model = await forecastService.getForecastModel();
  sendSuccess(res, model);
});

export const generateForecasts = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await forecastService.generateForecasts(user.organizationId, user.userId);
  sendSuccess(res, result, 201);
});
