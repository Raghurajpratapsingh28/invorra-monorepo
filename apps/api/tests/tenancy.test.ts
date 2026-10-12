import { afterAll, expect, it } from 'vitest';
import { cleanupOrganization, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('isolates products across tenants and ignores a client-supplied organization id', async () => {
  const alpha = await registerOwner('tenant-a');
  const beta = await registerOwner('tenant-b');
  organizationIds.push(alpha.user.organizationId, beta.user.organizationId);

  const created = await alpha.agent.post('/api/products').send({
    sku: 'TENANT-SKU',
    name: 'Tenant A Only',
    unitCost: '11.00',
    sellingPrice: '19.00',
  });
  expect(created.status).toBe(201);
  const productId = created.body.data.id as string;

  const betaList = await beta.agent.get('/api/products');
  expect(betaList.status).toBe(200);
  expect(betaList.body.data).toEqual([]);

  const betaGet = await beta.agent.get(`/api/products/${productId}`);
  expect(betaGet.status).toBe(404);

  const betaPatch = await beta.agent.patch(`/api/products/${productId}`).send({ name: 'Hijack' });
  expect(betaPatch.status).toBe(404);

  const injectedQuery = await beta.agent.get('/api/products').query({
    organizationId: alpha.user.organizationId,
  });
  expect(injectedQuery.status).toBe(400);
  expect(injectedQuery.body.error.code).toBe('VALIDATION_ERROR');

  const injectedBody = await beta.agent.post('/api/products').send({
    sku: 'OTHER',
    name: 'Should fail',
    unitCost: '10.00',
    sellingPrice: '12.00',
    organizationId: alpha.user.organizationId,
  });
  expect(injectedBody.status).toBe(400);

  const alphaStillThere = await alpha.agent.get(`/api/products/${productId}`);
  expect(alphaStillThere.status).toBe(200);
  expect(alphaStillThere.body.data.name).toBe('Tenant A Only');
});
