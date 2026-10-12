import { RiskLevel } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { DEMAND_LOOKBACK_DAYS } from '../src/config/business';
import { classifyRisk, daysOfInventory } from '../src/utils/risk';
import { cleanupOrganization, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('classifies days of inventory against the configured thresholds', () => {
  expect(daysOfInventory(10, 2)).toBe(5);
  expect(daysOfInventory(8, 0)).toBeNull();
  expect(daysOfInventory(0, 0)).toBe(0);

  expect(classifyRisk(14.01)).toBe(RiskLevel.LOW);
  expect(classifyRisk(14)).toBe(RiskLevel.MEDIUM);
  expect(classifyRisk(7.01)).toBe(RiskLevel.MEDIUM);
  expect(classifyRisk(7)).toBe(RiskLevel.HIGH);
  expect(classifyRisk(3.01)).toBe(RiskLevel.HIGH);
  expect(classifyRisk(3)).toBe(RiskLevel.CRITICAL);
  expect(classifyRisk(0)).toBe(RiskLevel.CRITICAL);
});

it('computes stockout risk from recent sales and current stock', async () => {
  const session = await registerOwner('risk');
  organizationIds.push(session.user.organizationId);

  const product = await session.agent.post('/api/products').send({
    sku: 'RISK-1',
    name: 'Toned Milk',
    unitCost: '20.00',
    sellingPrice: '32.00',
  });
  expect(product.status).toBe(201);

  const stocks = [
    { code: 'RISK-LOW', quantity: 40, level: 'LOW' },
    { code: 'RISK-MED', quantity: 20, level: 'MEDIUM' },
    { code: 'RISK-HIGH', quantity: 10, level: 'HIGH' },
    { code: 'RISK-CRIT', quantity: 6, level: 'CRITICAL' },
  ];

  for (const stock of stocks) {
    const warehouse = await session.agent.post('/api/warehouses').send({
      name: stock.code,
      code: stock.code,
      city: 'Delhi',
    });
    expect(warehouse.status).toBe(201);
    const inventory = await session.agent.post('/api/inventory').send({
      productId: product.body.data.id,
      warehouseId: warehouse.body.data.id,
      quantity: stock.quantity + 56,
    });
    expect(inventory.status).toBe(201);
    const sale = await session.agent.post('/api/sales').send({
      productId: product.body.data.id,
      warehouseId: warehouse.body.data.id,
      quantity: 56,
    });
    expect(sale.status).toBe(201);
    expect(sale.body.data.remainingQuantity).toBe(stock.quantity);
  }

  const idleProduct = await session.agent.post('/api/products').send({
    sku: 'RISK-IDLE',
    name: 'Idle SKU',
    unitCost: '10.00',
    sellingPrice: '12.00',
  });
  const idleWarehouse = await session.agent.post('/api/warehouses').send({
    name: 'Idle WH',
    code: 'RISK-IDLE',
    city: 'Mumbai',
  });
  await session.agent.post('/api/inventory').send({
    productId: idleProduct.body.data.id,
    warehouseId: idleWarehouse.body.data.id,
    quantity: 15,
  });

  const risks = await session.agent.get('/api/inventory/risks').query({ limit: 50 });
  expect(risks.status).toBe(200);
  const rows = risks.body.data as Array<{
    sku: string;
    warehouseCode: string;
    averageDailyDemand: number;
    daysOfInventory: number | null;
    riskLevel: string;
    lookbackDays: number;
  }>;

  expect(rows[0]?.riskLevel).toBe('CRITICAL');
  for (const stock of stocks) {
    const row = rows.find((candidate) => candidate.warehouseCode === stock.code);
    expect(row?.averageDailyDemand).toBeCloseTo(56 / DEMAND_LOOKBACK_DAYS, 4);
    expect(row?.daysOfInventory).toBeCloseTo(stock.quantity / 2, 2);
    expect(row?.riskLevel).toBe(stock.level);
    expect(row?.lookbackDays).toBe(DEMAND_LOOKBACK_DAYS);
  }

  const idle = rows.find((candidate) => candidate.sku === 'RISK-IDLE');
  expect(idle?.averageDailyDemand).toBe(0);
  expect(idle?.daysOfInventory).toBeNull();
  expect(idle?.riskLevel).toBe('LOW');

  const critical = await session.agent.get('/api/inventory/risks').query({ riskLevel: 'CRITICAL' });
  expect(critical.status).toBe(200);
  expect(critical.body.pagination.total).toBe(1);
  expect(critical.body.data[0].riskLevel).toBe('CRITICAL');
});
