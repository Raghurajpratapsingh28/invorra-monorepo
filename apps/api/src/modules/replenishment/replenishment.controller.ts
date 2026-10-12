import { z } from 'zod';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { getAuthUser, getValidated } from '../../utils/auth-context';
import {
  approveRecommendationSchema,
  listRecommendationsSchema,
  recommendationIdSchema,
  rejectRecommendationSchema,
} from './replenishment.schema';
import * as replenishmentService from './replenishment.service';

export const listRecommendations = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { query } = getValidated<z.infer<typeof listRecommendationsSchema>>(req);
  const result = await replenishmentService.listRecommendations(user.organizationId, query);
  sendSuccess(res, result.items, 200, result.pagination);
});

export const getRecommendation = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { params } = getValidated<z.infer<typeof recommendationIdSchema>>(req);
  const recommendation = await replenishmentService.getRecommendation(
    user.organizationId,
    params.id,
  );
  sendSuccess(res, recommendation);
});

export const generateRecommendations = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const result = await replenishmentService.generateRecommendations(
    user.organizationId,
    user.userId,
  );
  sendSuccess(res, result, 201);
});

export const approveRecommendation = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof approveRecommendationSchema>>(req);
  const result = await replenishmentService.approveRecommendation(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, result);
});

export const rejectRecommendation = asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { body, params } = getValidated<z.infer<typeof rejectRecommendationSchema>>(req);
  const result = await replenishmentService.rejectRecommendation(
    user.organizationId,
    user.userId,
    params.id,
    body,
  );
  sendSuccess(res, result);
});
