import jwt from 'jsonwebtoken';
import { UserRole } from '../domain/enums';
import { JWT_EXPIRES_IN } from '../config/auth';
import { env } from '../config/env';

export type AccessTokenPayload = {
  userId: string;
  organizationId: string;
  role: UserRole;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string') {
    throw new Error('Unexpected token payload');
  }

  const userId = decoded.userId;
  const organizationId = decoded.organizationId;
  const role = decoded.role;

  if (typeof userId !== 'string' || typeof organizationId !== 'string' || typeof role !== 'string') {
    throw new Error('Token payload is incomplete');
  }

  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new Error('Token role is invalid');
  }

  return {
    userId,
    organizationId,
    role: role as UserRole,
  };
}
