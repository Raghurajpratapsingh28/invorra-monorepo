import { afterAll, expect, it } from 'vitest';
import { cleanupOrganization, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('creates and updates inventory without allowing negative stock by default', async () => {
  const session = await registerOwner('inventory');
  organizationIds.push(session.user.organizationId);

  const product = await session.agent.post('/api/products').send({
    sku: 'INV-1',
    name: 'Hand Wash',
    unitCost: '40.00',
    sellingPrice: '70.00',
  });
  const warehouse = await session.agent.post('/api/warehouses').send({
    name: 'Delhi FC',
    code: 'DEL-INV',
    city: 'Delhi',
  });
  expect(product.status).toBe(201);
  expect(warehouse.status).toBe(201);

  const created = await session.agent.post('/api/inventory').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 12,
    reservedQty: 2,
  });
  expect(created.status).toBe(201);
  expect(created.body.data.quantity).toBe(12);
  expect(created.body.data.availableQty).toBe(10);
  const inventoryId = created.body.data.id as string;

  const duplicate = await session.agent.post('/api/inventory').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 1,
  });
  expect(duplicate.status).toBe(409);

  const updated = await session.agent.patch(`/api/inventory/${inventoryId}`).send({ quantity: 30 });
  expect(updated.status).toBe(200);
  expect(updated.body.data.quantity).toBe(30);

  const negative = await session.agent.patch(`/api/inventory/${inventoryId}`).send({ quantity: -5 });
  expect(negative.status).toBe(409);
  expect(negative.body.error.code).toBe('NEGATIVE_STOCK');

  const fetched = await session.agent.get(`/api/inventory/${inventoryId}`);
  expect(fetched.status).toBe(200);
  expect(fetched.body.data.quantity).toBe(30);
});
