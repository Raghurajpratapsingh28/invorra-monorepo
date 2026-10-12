import { z } from 'zod';
import {
  idSchema,
  nonNegativeMoneySchema,
  paginationFields,
} from '../../utils/zod';

export const listForecastsSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      productId: idSchema.optional(),
      warehouseId: idSchema.optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .strict(),
});

export const createForecastSchema = z.object({
  body: z
    .object({
      productId: idSchema,
      warehouseId: idSchema,
      forecastDate: z.coerce.date(),
      predictedDemand: nonNegativeMoneySchema,
      lowerBound: nonNegativeMoneySchema.optional(),
      upperBound: nonNegativeMoneySchema.optional(),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const forecastIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});

export const generateForecastsSchema = z.object({
  body: z.object({}).strict().optional().default({}),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});
