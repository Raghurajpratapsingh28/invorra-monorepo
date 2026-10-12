import { z } from 'zod';
import { idSchema, paginationFields } from '../../utils/zod';

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Code must be alphanumeric and may include hyphens');

export const listWarehousesSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      search: z.string().trim().min(1).max(100).optional(),
      city: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
});

export const createWarehouseSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120),
      code: codeSchema,
      city: z.string().trim().min(2).max(80),
      state: z.string().trim().min(2).max(80).nullable().optional(),
      address: z.string().trim().min(2).max(240).nullable().optional(),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const updateWarehouseSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      code: codeSchema.optional(),
      city: z.string().trim().min(2).max(80).optional(),
      state: z.string().trim().min(2).max(80).nullable().optional(),
      address: z.string().trim().min(2).max(240).nullable().optional(),
    })
    .strict()
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: 'At least one field is required',
    }),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const warehouseIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});
