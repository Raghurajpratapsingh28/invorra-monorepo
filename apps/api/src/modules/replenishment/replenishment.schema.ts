import { RecommendationStatus, RiskLevel } from '@prisma/client';
import { z } from 'zod';
import { idSchema, paginationFields } from '../../utils/zod';

export const listRecommendationsSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      status: z.nativeEnum(RecommendationStatus).optional(),
      riskLevel: z.nativeEnum(RiskLevel).optional(),
      productId: idSchema.optional(),
      warehouseId: idSchema.optional(),
    })
    .strict(),
});

export const generateRecommendationsSchema = z.object({
  body: z.object({}).strict().optional().default({}),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const recommendationIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});

export const approveRecommendationSchema = z.object({
  body: z
    .object({
      supplierId: idSchema.optional(),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const rejectRecommendationSchema = z.object({
  body: z
    .object({
      reason: z.string().trim().min(1).max(500).optional(),
    })
    .strict()
    .optional()
    .default({}),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});
