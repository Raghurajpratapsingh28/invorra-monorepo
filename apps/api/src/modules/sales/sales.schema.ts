import { z } from 'zod';
import { idSchema, moneySchema, paginationFields, positiveIntSchema } from '../../utils/zod';

export const listSalesSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      productId: idSchema.optional(),
      warehouseId: idSchema.optional(),
      channel: z.string().trim().min(1).max(40).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .strict()
    .refine((value) => !value.from || !value.to || value.from <= value.to, {
      message: '`from` must be before `to`',
      path: ['from'],
    }),
});

export const importSalesSchema = z.object({
  body: z
    .object({
      csv: z.string().trim().min(1).max(1_500_000),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const createSaleSchema = z.object({
  body: z
    .object({
      productId: idSchema,
      warehouseId: idSchema,
      quantity: positiveIntSchema,
      unitPrice: moneySchema.optional(),
      channel: z.string().trim().min(1).max(40).optional(),
      soldAt: z.coerce
        .date()
        .optional()
        .refine((value) => !value || value.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
          message: 'soldAt cannot be more than a day in the future',
        }),
      allowNegative: z.boolean().optional(),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});
