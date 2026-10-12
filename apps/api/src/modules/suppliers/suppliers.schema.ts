import { z } from 'zod';
import { emailSchema, idSchema, paginationFields } from '../../utils/zod';

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/);

const supplierFields = {
  name: z.string().trim().min(2).max(160),
  code: codeSchema,
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().min(6).max(24).nullable().optional(),
  city: z.string().trim().min(2).max(80).nullable().optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
};

export const listSuppliersSchema = z.object({
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

export const createSupplierSchema = z.object({
  body: z.object(supplierFields).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const updateSupplierSchema = z.object({
  body: z
    .object({
      name: supplierFields.name.optional(),
      code: supplierFields.code.optional(),
      email: supplierFields.email,
      phone: supplierFields.phone,
      city: supplierFields.city,
      leadTimeDays: supplierFields.leadTimeDays,
    })
    .strict()
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: 'At least one field is required',
    }),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const supplierIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});
