import { z } from 'zod';
import { idSchema } from '../../utils/zod';

export const chatSchema = z.object({
  body: z.object({ message: z.string().trim().min(1).max(2000) }).strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const confirmSchema = z.object({
  body: z
    .object({
      confirmationId: z.string().uuid(),
      confirm: z.boolean(),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const explainSchema = z.object({
  body: z
    .object({
      target: z.enum(['recommendation', 'inventory']),
      id: idSchema,
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});
