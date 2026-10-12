import { AUTH_COOKIE } from '../config/auth';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/errors';

export async function resolveUserFromToken(token: string) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      organizationId: true,
      role: true,
    },
  });

  if (!user || user.organizationId !== payload.organizationId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
  };
}

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token || typeof token !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  req.user = await resolveUserFromToken(token);
  next();
});
