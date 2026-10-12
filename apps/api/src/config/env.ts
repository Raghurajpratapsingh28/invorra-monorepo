import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z
    .string()
    .min(1)
    .refine((value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'), {
      message: 'MONGODB_URI must be a MongoDB connection string',
    }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CORS_ORIGIN: z.string().url(),
  AI_API_KEY: z.string().optional().default(''),
  AI_BASE_URL: z.string().url().optional().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().min(1).optional().default('gpt-4o-mini'),
  ML_SERVICE_URL: z.string().optional().default(''),
  FORECAST_PROVIDER: z.enum(['baseline', 'python']).optional().default('baseline'),
  NATS_URL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.flatten().fieldErrors;
  console.error('Invalid environment configuration:', fields);
  process.exit(1);
}

export const env = parsed.data;
