import { afterAll, expect, it } from 'vitest';
import { cols, countDocs, findOne } from '../src/db/mongo';
import type { AuditLogDoc, InventoryDoc } from '../src/domain/documents';
import { cleanupOrganization, loginAs, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('decrements inventory in a transaction and refuses to go negative', async () => {
  const session = await registerOwner('sales');
  organizationIds.push(session.user.organizationId);

  const product = await session.agent.post('/api/products').send({
    sku: 'SALE-1',
    name: 'Cold Coffee',
    unitCost: '20.00',
    sellingPrice: '45.00',
  });
  const warehouse = await session.agent.post('/api/warehouses').send({
    name: 'Mumbai FC',
    code: 'BOM-SALE',
    city: 'Mumbai',
  });
  const inventory = await session.agent.post('/api/inventory').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 10,
  });
  expect(inventory.status).toBe(201);

  const sale = await session.agent.post('/api/sales').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 4,
    channel: 'blinkit',
  });
  expect(sale.status).toBe(201);
  expect(sale.body.data.quantity).toBe(4);
  expect(sale.body.data.unitPrice).toBe('45.00');
  expect(sale.body.data.totalAmount).toBe('180.00');
  expect(sale.body.data.remainingQuantity).toBe(6);

  const stock = await findOne<InventoryDoc>(cols.inventory, {
    _id: inventory.body.data.id,
    organizationId: session.user.organizationId,
  });
  expect(stock?.quantity).toBe(6);

  const audit = await findOne<AuditLogDoc>(cols.auditLogs, {
    organizationId: session.user.organizationId,
    entityId: sale.body.data.id,
    action: 'SALE_RECORDED',
  });
  expect(audit).not.toBeNull();

  const before = await countDocs(cols.sales, {
    organizationId: session.user.organizationId,
    productId: product.body.data.id,
  });
  const rejected = await session.agent.post('/api/sales').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 20,
  });
  expect(rejected.status).toBe(409);
  expect(rejected.body.error.code).toBe('INSUFFICIENT_STOCK');

  const after = await countDocs(cols.sales, {
    organizationId: session.user.organizationId,
    productId: product.body.data.id,
  });
  const stockAfter = await findOne<InventoryDoc>(cols.inventory, {
    _id: inventory.body.data.id,
    organizationId: session.user.organizationId,
  });
  expect(after).toBe(before);
  expect(stockAfter?.quantity).toBe(6);

  const operator = await loginAs(session.user.organizationId, 'OPERATOR');
  const operatorNegative = await operator.agent.post('/api/sales').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 1,
    allowNegative: true,
  });
  expect(operatorNegative.status).toBe(403);

  const allowed = await session.agent.post('/api/sales').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 10,
    allowNegative: true,
  });
  expect(allowed.status).toBe(201);
  expect(allowed.body.data.remainingQuantity).toBe(-4);

  const blockedDelete = await session.agent.delete(`/api/products/${product.body.data.id}`);
  expect(blockedDelete.status).toBe(409);
  expect(blockedDelete.body.error.code).toBe('PRODUCT_IN_USE');
});
