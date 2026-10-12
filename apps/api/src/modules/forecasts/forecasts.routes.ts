import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { validate } from '../../utils/zod';
import * as forecastController from './forecasts.controller';
import {
  createForecastSchema,
  forecastIdSchema,
  generateForecastsSchema,
  listForecastsSchema,
} from './forecasts.schema';

export const forecastRouter = Router();

forecastRouter.use(requireAuth);
forecastRouter.get(
  '/',
  requirePermission('forecasts', 'read'),
  validate(listForecastsSchema),
  forecastController.listForecasts,
);
forecastRouter.get('/model', requirePermission('forecasts', 'read'), forecastController.getForecastModel);
forecastRouter.post(
  '/generate',
  requirePermission('forecasts', 'write'),
  validate(generateForecastsSchema),
  forecastController.generateForecasts,
);
forecastRouter.get(
  '/:id',
  requirePermission('forecasts', 'read'),
  validate(forecastIdSchema),
  forecastController.getForecast,
);
forecastRouter.post(
  '/',
  requirePermission('forecasts', 'write'),
  validate(createForecastSchema),
  forecastController.createForecast,
);
