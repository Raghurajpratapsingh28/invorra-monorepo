import type { NextFunction, Request, Response } from 'express';
import { MongoServerError } from 'mongodb';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AppError } from '../utils/errors';
import { formatZodError } from '../utils/zod';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) {
    return;
  }

  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details: unknown;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = formatZodError(error);
  } else if (error instanceof MongoServerError && error.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A record with these unique fields already exists';
  } else if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body must be valid JSON';
  }

  const logPayload = { err: error, code, path: req.originalUrl, method: req.method };
  if (statusCode >= 500) {
    logger.error(logPayload, message);
  } else if (env.NODE_ENV !== 'test') {
    logger.warn(logPayload, message);
  }

  const body: {
    success: false;
    error: { code: string; message: string; details?: unknown };
  } = {
    success: false,
    error: { code, message },
  };

  if (details !== undefined) {
    body.error.details = details;
  } else if (env.NODE_ENV === 'development' && statusCode >= 500 && error instanceof Error) {
    body.error.details = { stack: error.stack };
  }

  res.status(statusCode).json(body);
}
