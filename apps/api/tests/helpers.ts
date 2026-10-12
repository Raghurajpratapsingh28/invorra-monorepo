import { UserRole } from '@prisma/client';
import request, { type Agent } from 'supertest';
import { app } from '../src/app';
import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';
import { deleteTenant } from '../src/lib/tenant-cleanup';

export type AuthSession = {
  agent: Agent;
  email: string;
  password: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
    organization: { id: string; name: string; slug: string };
  };
};

export async function registerOwner(label: string): Promise<AuthSession> {
  const email = `owner-${label}-${Math.random().toString(16).slice(2)}@test.invorra`;
  const password = 'Password123';
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    organizationName: `test-${label}-${Math.random().toString(16).slice(2, 8)}`,
    name: 'Test Owner',
    email,
    password,
  });

  if (response.status !== 201) {
    throw new Error(`register failed ${response.status} ${JSON.stringify(response.body)}`);
  }

  return { agent, email, password, user: response.body.data.user };
}

export async function loginAs(organizationId: string, role: UserRole): Promise<AuthSession> {
  const email = `${role.toLowerCase()}-${Math.random().toString(16).slice(2)}@test.invorra`;
  const password = 'Password123';
  await prisma.user.create({
    data: {
      organizationId,
      email,
      name: role,
      role,
      passwordHash: await hashPassword(password),
    },
  });

  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  if (response.status !== 200) {
    throw new Error(`login failed ${response.status} ${JSON.stringify(response.body)}`);
  }

  return { agent, email, password, user: response.body.data.user };
}

export async function cleanupOrganization(organizationId: string | undefined): Promise<void> {
  if (!organizationId) {
    return;
  }
  await deleteTenant(organizationId);
}
