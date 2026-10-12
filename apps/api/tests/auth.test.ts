import { afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { cleanupOrganization, loginAs, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('registers an organization owner and keeps the session in an httpOnly cookie', async () => {
  const email = `owner-cookie-${Math.random().toString(16).slice(2)}@test.invorra`;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    organizationName: `test-auth-${Math.random().toString(16).slice(2, 8)}`,
    name: 'Test Owner',
    email,
    password: 'Password123',
  });

  expect(response.status).toBe(201);
  organizationIds.push(response.body.data.user.organizationId);
  expect(response.body.data.user.role).toBe('OWNER');
  expect(response.body.data.user.organization.slug.startsWith('test-auth-')).toBe(true);
  expect(response.body.data.token).toBeUndefined();
  expect(response.body.data.user.passwordHash).toBeUndefined();

  const cookie = response.headers['set-cookie']?.[0] ?? '';
  expect(cookie).toMatch(/invorra_token=/);
  expect(cookie).toMatch(/HttpOnly/i);

  const me = await agent.get('/api/auth/me');
  expect(me.status).toBe(200);
  expect(me.body.data.user.email).toBe(email);
});

it('rejects invalid registration and duplicate emails', async () => {
  const session = await registerOwner('auth-dup');
  organizationIds.push(session.user.organizationId);

  const invalid = await request(app).post('/api/auth/register').send({
    organizationName: 'X',
    name: 'A',
    email: 'not-an-email',
    password: 'short',
  });
  expect(invalid.status).toBe(400);
  expect(invalid.body.success).toBe(false);
  expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

  const duplicate = await request(app).post('/api/auth/register').send({
    organizationName: 'Another Org',
    name: 'Test Owner',
    email: session.email,
    password: 'Password123',
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');
});

it('logs in, logs out, and rejects bad credentials', async () => {
  const session = await registerOwner('auth-login');
  organizationIds.push(session.user.organizationId);

  const bad = await request(app).post('/api/auth/login').send({
    email: session.email,
    password: 'WrongPass1',
  });
  expect(bad.status).toBe(401);
  expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

  const loggedOut = request.agent(app);
  const login = await loggedOut.post('/api/auth/login').send({
    email: session.email,
    password: session.password,
  });
  expect(login.status).toBe(200);
  expect(login.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);

  const me = await loggedOut.get('/api/auth/me');
  expect(me.status).toBe(200);

  const logout = await loggedOut.post('/api/auth/logout');
  expect(logout.status).toBe(200);
  const after = await loggedOut.get('/api/auth/me');
  expect(after.status).toBe(401);
});

it('enforces read-only access for viewers', async () => {
  const owner = await registerOwner('auth-rbac');
  organizationIds.push(owner.user.organizationId);
  const viewer = await loginAs(owner.user.organizationId, 'VIEWER');

  const denied = await viewer.agent.post('/api/products').send({
    sku: 'VIEW-1',
    name: 'Viewer Product',
    unitCost: '10.00',
    sellingPrice: '12.00',
  });
  expect(denied.status).toBe(403);
  expect(denied.body.error.code).toBe('FORBIDDEN');

  const allowed = await viewer.agent.get('/api/products');
  expect(allowed.status).toBe(200);
  expect(allowed.body.success).toBe(true);
});
