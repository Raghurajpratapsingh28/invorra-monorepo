import { expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

it('reports process health and database readiness separately', async () => {
  const health = await request(app).get('/health');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ success: true, data: { status: 'ok' } });

  const ready = await request(app).get('/ready');
  expect(ready.status).toBe(200);
  expect(ready.body).toEqual({
    success: true,
    data: { status: 'ready', database: 'connected' },
  });
});

it('returns a structured 404 for unknown routes', async () => {
  const response = await request(app).get('/api/does-not-exist');
  expect(response.status).toBe(404);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe('NOT_FOUND');
});
