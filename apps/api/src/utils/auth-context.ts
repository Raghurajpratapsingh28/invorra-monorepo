import type { Request } from 'express';
import { AppError } from './errors';

export function getAuthUser(req: Request) {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return req.user;
}

export function getValidated<T>(req: Request): T {
  return req.validated as T;
}
