import { PurchaseOrderStatus } from '../../domain/enums';
import { z } from 'zod';
import { idSchema, moneySchema, paginationFields, positiveIntSchema } from '../../utils/zod';

const itemSchema = z.object({
  productId: idSchema,
  quantity: positiveIntSchema,
  unitCost: moneySchema.optional(),
});

export const listPurchaseOrdersSchema = z.object({
  body: z.unknown().optional(),
  params: z.object({}).optional(),
  query: z
    .object({
      ...paginationFields,
      status: z.nativeEnum(PurchaseOrderStatus).optional(),
      supplierId: idSchema.optional(),
      warehouseId: idSchema.optional(),
    })
    .strict(),
});

export const createPurchaseOrderSchema = z.object({
  body: z
    .object({
      supplierId: idSchema,
      warehouseId: idSchema,
      recommendationId: idSchema.optional(),
      notes: z.string().trim().min(1).max(2000).nullable().optional(),
      expectedAt: z.coerce.date().optional(),
      items: z.array(itemSchema).min(1).max(100),
    })
    .strict()
    .superRefine((value, ctx) => {
      const ids = value.items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each product can appear only once on a purchase order',
          path: ['items'],
        });
      }
    }),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const updatePurchaseOrderSchema = z.object({
  body: z
    .object({
      status: z.nativeEnum(PurchaseOrderStatus).optional(),
      notes: z.string().trim().min(1).max(2000).nullable().optional(),
      expectedAt: z.coerce.date().nullable().optional(),
    })
    .strict()
    .refine((value) => Object.values(value).some((field) => field !== undefined), {
      message: 'At least one field is required',
    }),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const purchaseOrderIdSchema = z.object({
  body: z.unknown().optional(),
  query: z.object({}).passthrough().optional(),
  params: z.object({ id: idSchema }).strict(),
});

export const updatePurchaseOrderStatusSchema = z.object({
  body: z
    .object({
      status: z.nativeEnum(PurchaseOrderStatus),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});

export const receivePurchaseOrderSchema = z.object({
  body: z
    .object({
      items: z
        .array(
          z.object({
            purchaseOrderItemId: idSchema,
            quantity: positiveIntSchema,
          }),
        )
        .min(1)
        .max(100),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({ id: idSchema }).strict(),
});
