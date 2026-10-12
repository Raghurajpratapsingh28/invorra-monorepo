import { Prisma, UserRole } from '@prisma/client';
import { AuditAction, recordAudit } from '../../lib/audit';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { AppError, conflict } from '../../utils/errors';
import { slugify, uniqueSlugCandidate } from '../../utils/slug';
import type { LoginBody, RegisterBody } from './auth.schema';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  organizationId: true,
  organization: {
    select: { id: true, name: true, slug: true },
  },
} satisfies Prisma.UserSelect;

type PublicUserRecord = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function toPublicUser(user: PublicUserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organization: user.organization,
  };
}

export async function register(input: RegisterBody) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw conflict('EMAIL_IN_USE', 'Email already registered');
  }

  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.organizationName);

  try {
    const user = await prisma.$transaction(async (tx) => {
      let slug = uniqueSlugCandidate(baseSlug, 1);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = uniqueSlugCandidate(baseSlug, attempt);
        const taken = await tx.organization.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        if (!taken) {
          slug = candidate;
          break;
        }
      }

      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      const created = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.email,
          name: input.name,
          passwordHash,
          role: UserRole.OWNER,
        },
        select: userSelect,
      });

      await recordAudit(tx, {
        organizationId: organization.id,
        userId: created.id,
        action: AuditAction.ORG_REGISTERED,
        entityType: 'Organization',
        entityId: organization.id,
        metadata: { slug, email: created.email },
      });

      return created;
    });

    const token = signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });

    return { user: toPublicUser(user), token };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('EMAIL_IN_USE', 'Email already registered');
    }
    throw error;
  }
}

export async function login(input: LoginBody) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });

  const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  await recordAudit(prisma, {
    organizationId: user.organizationId,
    userId: user.id,
    action: AuditAction.USER_LOGIN,
    entityType: 'User',
    entityId: user.id,
  });

  const token = signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
  });

  return {
    user: toPublicUser(user),
    token,
  };
}

export async function getMe(userId: string, organizationId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId },
    select: userSelect,
  });

  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return toPublicUser(user);
}

export async function logout(userId: string, organizationId: string) {
  await recordAudit(prisma, {
    organizationId,
    userId,
    action: AuditAction.USER_LOGOUT,
    entityType: 'User',
    entityId: userId,
  });
}
