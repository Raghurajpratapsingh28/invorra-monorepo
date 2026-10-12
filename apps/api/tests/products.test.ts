import { afterAll, expect, it } from 'vitest';
import { cleanupOrganization, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('creates, reads, updates, and deletes a product inside the tenant', async () => {
  const session = await registerOwner('products');
  organizationIds.push(session.user.organizationId);

  const created = await session.agent.post('/api/products').send({
    sku: 'SKU-100',
    name: 'Masala Oats',
    category: 'Snacks',
    unitCost: '18.50',
    sellingPrice: '30.00',
    leadTimeDays: 5,
  });
  expect(created.status).toBe(201);
  expect(created.body.data.sku).toBe('SKU-100');
  expect(created.body.data.organizationId).toBe(session.user.organizationId);
  const productId = created.body.data.id as string;

  const duplicate = await session.agent.post('/api/products').send({
    sku: 'SKU-100',
    name: 'Duplicate',
    unitCost: '10.00',
    sellingPrice: '12.00',
  });
  expect(duplicate.status).toBe(409);
  expect(duplicate.body.error.code).toBe('SKU_CONFLICT');

  const fetched = await session.agent.get(`/api/products/${productId}`);
  expect(fetched.status).toBe(200);
  expect(fetched.body.data.name).toBe('Masala Oats');

  const list = await session.agent.get('/api/products').query({ search: 'oats', page: 1, limit: 10 });
  expect(list.status).toBe(200);
  expect(list.body.pagination.total).toBe(1);
  expect(list.body.data[0].id).toBe(productId);

  const updated = await session.agent.patch(`/api/products/${productId}`).send({
    name: 'Masala Oats Cup',
    status: 'INACTIVE',
  });
  expect(updated.status).toBe(200);
  expect(updated.body.data.name).toBe('Masala Oats Cup');
  expect(updated.body.data.status).toBe('INACTIVE');

  const removed = await session.agent.delete(`/api/products/${productId}`);
  expect(removed.status).toBe(200);
  expect(removed.body.data.deleted).toBe(true);

  const missing = await session.agent.get(`/api/products/${productId}`);
  expect(missing.status).toBe(404);
});
