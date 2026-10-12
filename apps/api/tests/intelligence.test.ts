import { RiskLevel } from '@prisma/client';
import { afterAll, expect, it } from 'vitest';
import { FORECAST_WEIGHTS, SERVICE_LEVEL_Z } from '../src/config/business';
import {
  applyLeadTimeRisk,
  buildExplanation,
  buildPositionPlan,
  calendarDatesEnding,
  composeOrder,
  forecastConfidence,
  movingAverage,
  normalCdf,
  roundUpToMoq,
  safetyStockUnits,
  stockoutProbability,
  weightedBaseline,
} from '../src/modules/intelligence/planner';
import { cleanupOrganization, loginAs, registerOwner } from './helpers';

const organizationIds: string[] = [];

afterAll(async () => {
  for (const organizationId of organizationIds) {
    await cleanupOrganization(organizationId);
  }
});

it('combines 7, 14, and 30 day averages with configurable weights', () => {
  const history = Array.from({ length: 30 }, (_, index) => (index < 23 ? 10 : 20));
  expect(movingAverage(history, 7)).toBeCloseTo(20, 5);
  expect(movingAverage(history, 14)).toBeCloseTo((7 * 10 + 7 * 20) / 14, 5);
  expect(movingAverage(history, 30)).toBeCloseTo((23 * 10 + 7 * 20) / 30, 5);
  const baseline = weightedBaseline(history, FORECAST_WEIGHTS);
  expect(baseline).toBeCloseTo(
    FORECAST_WEIGHTS.sevenDay * movingAverage(history, 7) +
      FORECAST_WEIGHTS.fourteenDay * movingAverage(history, 14) +
      FORECAST_WEIGHTS.thirtyDay * movingAverage(history, 30),
    5,
  );
});

it('raises weekend forecasts when weekends historically sell more', () => {
  const dates = calendarDatesEnding('2026-09-27', 30);
  const history = dates.map((date) => {
    const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    return dow === 0 || dow === 6 ? 20 : 10;
  });
  const plan = buildPositionPlan({
    history,
    historyDates: dates,
    currentStock: 500,
    leadTimeDays: 3,
    moq: 1,
    horizonDays: 14,
  });
  const saturday = plan.forecasts.find(
    (day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === 6,
  );
  const wednesday = plan.forecasts.find(
    (day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === 3,
  );
  expect(saturday && wednesday && saturday.predictedDemand).toBeGreaterThan(
    wednesday?.predictedDemand ?? 0,
  );
  expect(plan.confidence).toBeGreaterThan(0.5);
  expect(plan.confidence).toBeLessThanOrEqual(1);
});

it('scores confidence from coverage and variability, not randomness', () => {
  expect(forecastConfidence(Array(30).fill(0))).toBe(0);
  expect(forecastConfidence(Array(30).fill(8))).toBe(1);
  const noisy = forecastConfidence([1, 20, 0, 15, 2, 0, 0, 18]);
  const stable = forecastConfidence(Array(8).fill(10));
  expect(stable).toBeGreaterThan(noisy);
  expect(normalCdf(0)).toBeCloseTo(0.5, 2);
});

it('estimates stockout probability from inventory, lead time, and variability', () => {
  expect(
    stockoutProbability({
      availableStock: 0,
      leadTimeDays: 3,
      leadTimeDemand: 40,
      dailyStdDev: 5,
    }),
  ).toBe(1);
  expect(
    stockoutProbability({
      availableStock: 100,
      leadTimeDays: 3,
      leadTimeDemand: 0,
      dailyStdDev: 0,
    }),
  ).toBe(0);
  const comfortable = stockoutProbability({
    availableStock: 200,
    leadTimeDays: 3,
    leadTimeDemand: 30,
    dailyStdDev: 2,
  });
  const tight = stockoutProbability({
    availableStock: 20,
    leadTimeDays: 3,
    leadTimeDemand: 30,
    dailyStdDev: 2,
  });
  expect(tight).toBeGreaterThan(comfortable);
  expect(applyLeadTimeRisk(10, 14)).toBe(RiskLevel.HIGH);
  expect(applyLeadTimeRisk(20, 5)).toBe(RiskLevel.LOW);
  expect(applyLeadTimeRisk(2, 5)).toBe(RiskLevel.CRITICAL);
});

it('rounds replenishment quantity up to the MOQ and explains the math', () => {
  expect(safetyStockUnits(10, 4, SERVICE_LEVEL_Z)).toBe(Math.ceil(1.65 * 10 * 2));
  expect(roundUpToMoq(1680, 144)).toBe(1728);
  expect(roundUpToMoq(144, 144)).toBe(144);
  expect(roundUpToMoq(145, 144)).toBe(288);
  expect(roundUpToMoq(0, 144)).toBe(0);

  const order = composeOrder({
    forecastDemand: 1820,
    safetyStock: 200,
    currentStock: 340,
    moq: 144,
  });
  expect(order.requiredStock).toBe(2020);
  expect(order.rawOrderQuantity).toBe(1680);
  expect(order.recommendedQty).toBe(1728);
  expect(order.explanation).toBe(buildExplanation({
    recommendedQty: 1728,
    forecastDemand: 1820,
    currentStock: 340,
    safetyStock: 200,
    moq: 144,
  }));
  expect(order.explanation).toContain('1,820');
  expect(order.explanation).toContain('340');
  expect(order.explanation).toContain('200');
  expect(order.explanation).toContain('144');
  expect(order.explanation).toContain('1,728');
});

it('approves a recommendation into a purchase order without crossing tenants', async () => {
  const owner = await registerOwner('intel');
  const other = await registerOwner('intel-other');
  organizationIds.push(owner.user.organizationId, other.user.organizationId);

  const product = await owner.agent.post('/api/products').send({
    sku: 'PLAN-1',
    name: 'Planning SKU',
    unitCost: '10.00',
    sellingPrice: '16.00',
    leadTimeDays: 3,
    moq: 144,
  });
  const warehouse = await owner.agent.post('/api/warehouses').send({
    name: 'Planning FC',
    code: 'PLN-01',
    city: 'Delhi',
  });
  const supplier = await owner.agent.post('/api/suppliers').send({
    name: 'Planning Supply',
    code: 'SUP-PLAN',
    leadTimeDays: 3,
  });
  expect(product.status).toBe(201);
  expect(warehouse.status).toBe(201);
  expect(supplier.status).toBe(201);

  await owner.agent.post('/api/inventory').send({
    productId: product.body.data.id,
    warehouseId: warehouse.body.data.id,
    quantity: 20,
  });
  for (let day = 0; day < 14; day += 1) {
    const soldAt = new Date();
    soldAt.setUTCDate(soldAt.getUTCDate() - day);
    const sale = await owner.agent.post('/api/sales').send({
      productId: product.body.data.id,
      warehouseId: warehouse.body.data.id,
      quantity: 8,
      soldAt: soldAt.toISOString(),
      allowNegative: true,
    });
    expect(sale.status).toBe(201);
  }

  const first = await owner.agent.post('/api/forecasts/generate').send({});
  const second = await owner.agent.post('/api/forecasts/generate').send({});
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  const listed = await owner.agent.get('/api/forecasts').query({
    productId: product.body.data.id,
    limit: 50,
  });
  expect(listed.status).toBe(200);
  expect(listed.body.pagination.total).toBeGreaterThan(0);
  expect(listed.body.data[0].confidence).toBeTruthy();
  expect(listed.body.data[0].modelVersion).toBe('weighted-ma-v1');

  const generated = await owner.agent.post('/api/replenishment/generate').send({});
  expect(generated.status).toBe(201);
  expect(generated.body.data.created).toBeGreaterThan(0);

  const recommendations = await owner.agent.get('/api/replenishment').query({ limit: 10 });
  const recommendation = recommendations.body.data[0];
  expect(recommendation.rationale).toContain('Recommended');
  expect(recommendation.moq).toBe(144);
  expect(recommendation.recommendedQty % 144).toBe(0);

  const approved = await owner.agent
    .post(`/api/replenishment/${recommendation.id}/approve`)
    .send({ supplierId: supplier.body.data.id });
  expect(approved.status).toBe(200);
  expect(approved.body.data.poNumber).toBeTruthy();

  const purchaseOrder = await owner.agent.get(
    `/api/purchase-orders/${approved.body.data.purchaseOrderId}`,
  );
  expect(purchaseOrder.status).toBe(200);
  expect(purchaseOrder.body.data.status).toBe('PENDING_APPROVAL');
  expect(purchaseOrder.body.data.items[0].quantity).toBe(recommendation.recommendedQty);
  expect(purchaseOrder.body.data.totalAmount).toBeTruthy();

  const viewer = await loginAs(owner.user.organizationId, 'VIEWER');
  const viewerApproval = await viewer.agent
    .patch(`/api/purchase-orders/${approved.body.data.purchaseOrderId}/status`)
    .send({ status: 'APPROVED' });
  expect(viewerApproval.status).toBe(403);

  const hidden = await other.agent.get(`/api/purchase-orders/${approved.body.data.purchaseOrderId}`);
  expect(hidden.status).toBe(404);
  const hiddenRecommendation = await other.agent.get(`/api/replenishment/${recommendation.id}`);
  expect(hiddenRecommendation.status).toBe(404);

  const viewerDenied = await other.agent
    .patch(`/api/purchase-orders/${approved.body.data.purchaseOrderId}/status`)
    .send({ status: 'APPROVED' });
  expect(viewerDenied.status).toBe(404);

  const promoted = await owner.agent
    .patch(`/api/purchase-orders/${approved.body.data.purchaseOrderId}/status`)
    .send({ status: 'APPROVED' });
  expect(promoted.status).toBe(200);
  expect(promoted.body.data.status).toBe('APPROVED');
});
