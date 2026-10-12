import type { NextFunction, Request, Response } from 'express';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { AppError } from './errors';

export const idSchema = z.string().uuid();

export const paginationFields = {
  page: z.coerce.number().int().positive().max(100_000).default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

export const skuSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'SKU must be alphanumeric and may include . _ -');

export const moneySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Must be a positive amount with up to 2 decimal places',
    });
    return z.NEVER;
  }
  return raw;
});

export const optionalMoneySchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) {
      return undefined;
    }
    const raw = typeof value === 'number' ? value.toString() : value.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Must be a non-negative amount with up to 2 decimal places',
      });
      return z.NEVER;
    }
    return raw;
  });

export const positiveIntSchema = z.coerce.number().int().positive().max(1_000_000);
export const nonNegativeIntSchema = z.coerce.number().int().nonnegative().max(1_000_000);

export const nonNegativeMoneySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Must be a non-negative amount with up to 2 decimal places',
    });
    return z.NEVER;
  }
  return raw;
});

export function requestSchema<TBody extends ZodTypeAny, TQuery extends ZodTypeAny, TParams extends ZodTypeAny>(
  body: TBody,
  query: TQuery,
  params: TParams,
) {
  return z.object({ body, query, params });
}

export function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Request validation failed',
          formatZodError(result.error),
        ),
      );
      return;
    }

    req.validated = result.data as Express.Request['validated'];
    next();
  };
}
