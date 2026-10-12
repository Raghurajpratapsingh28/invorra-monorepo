import type { NextFunction, Request, Response } from 'express';
import { type Action, can, type Resource } from '../config/permissions';
import { AppError } from '../utils/errors';

export function requirePermission(resource: Resource, action: Action) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    if (!can(req.user.role, resource, action)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }

    next();
  };
}
