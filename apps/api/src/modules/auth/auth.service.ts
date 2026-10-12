import { MongoServerError } from 'mongodb';
import { UserRole } from '../../domain/enums';
import { cols, findOne, insertOne, withTransaction } from '../../db/mongo';
import type { OrganizationDoc, UserDoc } from '../../domain/documents';
import { AuditAction, recordAudit } from '../../lib/audit';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { AppError, conflict } from '../../utils/errors';
import { slugify, uniqueSlugCandidate } from '../../utils/slug';
import type { LoginBody, RegisterBody } from './auth.schema';

type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserDoc['role'];
  organizationId: string;
  organization: { id: string; name: string; slug: string };
};

async function withOrganization(user: UserDoc): Promise<PublicUser> {
  const organization = await findOne<OrganizationDoc>(cols.organizations, { _id: user.organizationId });
  if (!organization) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
  };
}

export function toPublicUser(user: PublicUser) {
  return user;
}

export async function register(input: RegisterBody) {
  const existing = await findOne<UserDoc>(cols.users, { email: input.email });
  if (existing) {
    throw conflict('EMAIL_IN_USE', 'Email already registered');
  }
  const passwordHash = await hashPassword(input.password);
  const baseSlug = slugify(input.organizationName);

  try {
    const user = await withTransaction(async () => {
      let slug = uniqueSlugCandidate(baseSlug, 1);
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const candidate = uniqueSlugCandidate(baseSlug, attempt);
        const taken = await findOne<OrganizationDoc>(cols.organizations, { slug: candidate });
        if (!taken) {
          slug = candidate;
          break;
        }
      }
      const organization = await insertOne<OrganizationDoc>(cols.organizations, {
        name: input.organizationName,
        slug,
      });
      const created = await insertOne<UserDoc>(cols.users, {
        organizationId: organization.id,
        email: input.email,
        name: input.name,
        passwordHash,
        role: UserRole.OWNER,
      });
      await recordAudit({
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
    return { user: await withOrganization(user), token };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw conflict('EMAIL_IN_USE', 'Email already registered');
    }
    throw error;
  }
}

export async function login(input: LoginBody) {
  const user = await findOne<UserDoc>(cols.users, { email: input.email });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  await recordAudit({
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
  return { user: await withOrganization(user), token };
}

export async function getMe(userId: string, organizationId: string) {
  const user = await findOne<UserDoc>(cols.users, { _id: userId, organizationId });
  if (!user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return withOrganization(user);
}

export async function logout(userId: string, organizationId: string) {
  await recordAudit({
    organizationId,
    userId,
    action: AuditAction.USER_LOGOUT,
    entityType: 'User',
    entityId: userId,
  });
}
