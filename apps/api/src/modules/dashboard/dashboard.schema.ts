import { z } from 'zod';

export const summarySchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      days: z.coerce.number().int().min(1).max(180).default(30),
    })
    .strict(),
});

export const salesSeriesSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      days: z.coerce.number().int().min(7).max(180).default(30),
    })
    .strict(),
});
