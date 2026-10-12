import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../utils/zod';

export const registerSchema = z.object({
  body: z
    .object({
      organizationName: z.string().trim().min(2).max(120),
      name: z.string().trim().min(2).max(120),
      email: emailSchema,
      password: passwordSchema,
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const loginSchema = z.object({
  body: z
    .object({
      email: emailSchema,
      password: z.string().min(1).max(72),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export type RegisterBody = z.infer<typeof registerSchema>['body'];
export type LoginBody = z.infer<typeof loginSchema>['body'];
