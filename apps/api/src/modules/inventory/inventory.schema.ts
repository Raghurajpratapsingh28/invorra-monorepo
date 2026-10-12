import { RiskLevel } from '../../domain/enums';
import { z } from 'zod';
import { idSchema, nonNegativeIntSchema, paginationFields } from '../../utils/zod';

export const listInventorySchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      productId: idSchema.optional(),
      warehouseId: idSchema.optional(),
    })
    .strict(),
});

export const inventoryRisksSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      productId: idSchema.optional(),
      warehouseId: idSchema.optional(),
      riskLevel: z.nativeEnum(RiskLevel).optional(),
      search: z.string().trim().min(1).max(100).optional(),
    })
    .strict(),
});

export const createInventorySchema = z.object({
  body: z
    .object({
      productId: idSchema,
      warehouseId: idSchema,
      quantity: nonNegativeIntSchema,
      reservedQty: nonNegativeIntSchema.optional(),
      reorderPoint: nonNegativeIntSchema.optional(),
    })
    .strict()
    .refine((value) => (value.reservedQty ?? 0) <= value.quantity, {
      message: 'Reserved quantity cannot exceed on-hand quantity',
      path: ['reservedQty'],
    }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const updateInventorySchema = z.object({
  body: z
    .object({
      quantity: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
      reservedQty: nonNegativeIntSchema.optional(),
      reorderPoint: nonNegativeIntSchema.optional(),
      allowNegative: z.boolean().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).some((key) => key !== 'allowNegative' && value[key as keyof typeof value] !== undefined), {
      message: 'At least one inventory field is required',
    }),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const inventoryIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});
