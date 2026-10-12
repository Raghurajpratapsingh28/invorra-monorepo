import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { pingMongo } from './db/mongo';
import { requestContext } from './lib/request-context';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiRouter } from './routes';
import { sendSuccess } from './utils/api-response';
import { asyncHandler } from './utils/async-handler';
import { AppError } from './utils/errors';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }),
);
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const header = req.headers['x-request-id'];
      const requestId = typeof header === 'string' && header.length > 0 ? header : randomUUID();
      res.setHeader('x-request-id', requestId);
      return requestId;
    },
    customSuccessObject: (req, res, value) => ({
      requestId: req.id,
      method: req.method,
      path: req.url,
      status: res.statusCode,
      duration: value.responseTime,
    }),
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) {
        return 'error';
      }
      if (res.statusCode >= 400) {
        return 'warn';
      }
      return 'info';
    },
  }),
);
app.use((req, _res, next) => {
  requestContext.run({ requestId: String(req.id ?? ''), ip: req.ip }, () => next());
});
if (env.NODE_ENV !== 'test') {
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
}
if (env.NODE_ENV === 'test') {
  app.use((_req, res, next) => {
    res.setHeader('Connection', 'close');
    next();
  });
}
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  sendSuccess(res, { name: 'Invorra API', health: '/health', ready: '/ready', docs: '/api/openapi.yaml' });
});

app.get('/health', (_req, res) => {
  sendSuccess(res, { status: 'ok' });
});

app.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    try {
      await pingMongo();
    } catch {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is unreachable');
    }
    sendSuccess(res, { status: 'ready', database: 'connected' });
  }),
);

app.get('/api/openapi.yaml', (_req, res) => {
  const candidates = [
    path.resolve(process.cwd(), 'openapi.yaml'),
    path.resolve(process.cwd(), 'apps/api/openapi.yaml'),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OpenAPI spec not found' } });
    return;
  }
  res.type('application/yaml').send(fs.readFileSync(file, 'utf8'));
});

app.use('/api', apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
