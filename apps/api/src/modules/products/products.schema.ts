import { ProductStatus } from '../../domain/enums';
import { z } from 'zod';
import {
  idSchema,
  moneySchema,
  nonNegativeIntSchema,
  paginationFields,
  skuSchema,
} from '../../utils/zod';

const productFields = {
  sku: skuSchema,
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(80).nullable().optional(),
  brand: z.string().trim().min(1).max(80).nullable().optional(),
  unit: z.string().trim().min(1).max(24).optional(),
  unitCost: moneySchema,
  sellingPrice: moneySchema,
  status: z.nativeEnum(ProductStatus).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  reorderPoint: nonNegativeIntSchema.optional(),
  safetyStock: nonNegativeIntSchema.optional(),
  moq: z.coerce.number().int().positive().max(100_000).optional(),
};

export const listProductsSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      search: z.string().trim().min(1).max(100).optional(),
      status: z.nativeEnum(ProductStatus).optional(),
      category: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
});

export const createProductSchema = z.object({
  body: z.object(productFields).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const updateProductSchema = z.object({
  body: z
    .object({
      sku: skuSchema.optional(),
      name: productFields.name.optional(),
      category: productFields.category,
      brand: productFields.brand,
      unit: productFields.unit,
      unitCost: moneySchema.optional(),
      sellingPrice: moneySchema.optional(),
      status: productFields.status,
      leadTimeDays: productFields.leadTimeDays,
      reorderPoint: productFields.reorderPoint,
      safetyStock: productFields.safetyStock,
      moq: productFields.moq,
    })
    .strict()
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: 'At least one field is required',
    }),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const productIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});
