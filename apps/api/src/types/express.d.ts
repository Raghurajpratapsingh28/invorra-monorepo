import type { UserRole } from '../domain/enums';

export type AuthUser = {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
