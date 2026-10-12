import { afterAll, expect, it } from 'vitest';
import { cleanupOrganization, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('answers from live recommendations and waits for confirmation before approving', async () => {
  const owner = await registerOwner('assistant');
  organizationIds.push(owner.user.organizationId);

  const product = await owner.agent.post('/api/products').send({
    sku: 'ASSIST-1',
    name: 'Cold Brew',
    unitCost: '20.00',
    sellingPrice: '40.00',
    leadTimeDays: 3,
    moq: 12,
  });
  expect(product.status).toBe(201);

  const warehouse = await owner.agent.post('/api/warehouses').send({
    name: 'Assist FC',
    code: 'AST-01',
    city: 'Mumbai',
  });
  expect(warehouse.status).toBe(201);

  const supplier = await owner.agent.post('/api/suppliers').send({
    name: 'Assist Supply',
    code: 'SUP-AST',
    leadTimeDays: 3,
  });
  expect(supplier.status).toBe(201);

  const inventory = await owner.agent.post('/api/inventory').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 5,
  });
  expect(inventory.status).toBe(201);

  const sale = await owner.agent.post('/api/sales').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 30,
    allowNegative: true,
  });
  expect(sale.status).toBe(201);

  const forecast = await owner.agent.post('/api/forecasts/generate').send({});
  expect(forecast.status).toBe(201);

  const generated = await owner.agent.post('/api/replenishment/generate').send({});
  expect(generated.status).toBe(201);

  const order = await owner.agent.post('/api/assistant/chat').send({
    message: 'What should I order today?',
  });
  expect(order.status).toBe(200);
  expect(order.body.data.toolsUsed).toContain('getReplenishmentRecommendations');
  expect(order.body.data.reply).toContain('ASSIST-1');
  expect(order.body.data.confirmation).toBeNull();

  const risk = await owner.agent
    .post('/api/assistant/chat')
    .send({ message: 'Why is Cold Brew marked high risk?' });
  expect(risk.status).toBe(200);
  expect(risk.body.data.reply).toContain('Cold Brew');

  const pending = await owner.agent.get('/api/replenishment').query({ status: 'PENDING' });
  const before = pending.body.pagination.total as number;

  const approve = await owner.agent.post('/api/assistant/chat').send({ message: 'Approve all of them.' });
  expect(approve.status).toBe(200);
  expect(approve.body.data.confirmation?.id).toBeTruthy();

  const stillPending = await owner.agent.get('/api/replenishment').query({ status: 'PENDING' });
  expect(stillPending.body.pagination.total).toBe(before);

  const confirmed = await owner.agent.post('/api/assistant/confirm').send({
    confirmationId: approve.body.data.confirmation.id,
    confirm: true,
  });
  expect(confirmed.status).toBe(200);
  expect(confirmed.body.data.executed).toBe(true);

  const explain = await owner.agent.post('/api/assistant/explain').send({
    target: 'inventory',
    id: inventory.body.data.id,
  });
  expect(explain.status).toBe(200);
  expect(explain.body.data.explanation).toContain(String(explain.body.data.facts.currentStock));

  const logs = await owner.agent.get('/api/audit-logs').query({ action: 'RECOMMENDATION_CREATED' });
  expect(logs.status).toBe(200);
  expect(logs.body.pagination.total).toBeGreaterThan(0);
});
