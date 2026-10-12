import { env } from '../../config/env';
import { FORECAST_MODEL_VERSION } from '../../config/business';
import { logger } from '../../lib/logger';
import { buildPositionPlan, type DailyForecast } from '../intelligence/planner';

export type ForecastProjection = {
  modelVersion: string;
  confidence: number;
  forecasts: DailyForecast[];
  metadata: Record<string, unknown>;
};

export interface ForecastProvider {
  readonly name: 'baseline' | 'python';
  project(input: {
    history: number[];
    historyDates: string[];
    horizonDays: number;
    currentStock: number;
    leadTimeDays: number;
    moq: number;
  }): Promise<ForecastProjection>;
}

class BaselineForecastProvider implements ForecastProvider {
  readonly name = 'baseline' as const;

  async project(input: ForecastProvider['project'] extends (arg: infer A) => unknown ? A : never): Promise<ForecastProjection> {
    const plan = buildPositionPlan(input);
    return {
      modelVersion: FORECAST_MODEL_VERSION,
      confidence: plan.confidence,
      forecasts: plan.forecasts,
      metadata: {
        method: 'weighted-moving-average',
        weights: '0.5/0.3/0.2',
        limitation: 'Day-of-week index only. No promotions or price elasticity.',
      },
    };
  }
}

class PythonForecastProvider implements ForecastProvider {
  readonly name = 'python' as const;

  async project(input: Parameters<BaselineForecastProvider['project']>[0]): Promise<ForecastProjection> {
    const response = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, '')}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: input.historyDates.map((date, index) => ({
          date,
          quantity: input.history[index] ?? 0,
        })),
        horizonDays: input.horizonDays,
      }),
    });
    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }
    const body = (await response.json()) as {
      forecast: Array<{ date: string; predictedDemand: number; lowerBound?: number; upperBound?: number }>;
      confidence: number;
      metadata?: Record<string, unknown>;
    };
    return {
      modelVersion: 'python-smoothing-v1',
      confidence: body.confidence,
      forecasts: body.forecast.map((day) => ({
        date: day.date,
        predictedDemand: day.predictedDemand,
        lowerBound: day.lowerBound ?? day.predictedDemand,
        upperBound: day.upperBound ?? day.predictedDemand,
      })),
      metadata: body.metadata ?? { method: 'exponential-smoothing' },
    };
  }
}

const baseline = new BaselineForecastProvider();
const ML_MODEL_VERSION = 'gbm-demand-v2';

export function getForecastProvider(): ForecastProvider {
  if (env.NODE_ENV === 'test') {
    return baseline;
  }
  if (env.FORECAST_PROVIDER === 'python' && env.ML_SERVICE_URL) {
    return new PythonForecastProvider();
  }
  return baseline;
}

export async function fetchModelCard(): Promise<Record<string, unknown>> {
  if (getForecastProvider().name !== 'python') {
    return {
      name: FORECAST_MODEL_VERSION,
      algorithm: 'Weighted moving average',
      features: ['7-day average', '14-day average', '30-day average', 'weekday index'],
      active: false,
    };
  }
  const response = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, '')}/model`);
  if (!response.ok) {
    throw new Error(`ML service returned ${response.status}`);
  }
  return { ...(await response.json() as Record<string, unknown>), active: true };
}

type RemoteForecast = {
  forecast: Array<{ date: string; predictedDemand: number; lowerBound?: number; upperBound?: number }>;
  confidence: number;
  metadata?: Record<string, unknown>;
};

export async function projectBatch(
  inputs: Array<Parameters<BaselineForecastProvider['project']>[0] & { id: string }>,
): Promise<Map<string, ForecastProjection & { plan: ReturnType<typeof buildPositionPlan> }>> {
  const plans = new Map(inputs.map((input) => [input.id, buildPositionPlan(input)]));
  const output = new Map<string, ForecastProjection & { plan: ReturnType<typeof buildPositionPlan> }>();
  const provider = getForecastProvider();

  if (provider.name !== 'python' || inputs.length === 0) {
    for (const input of inputs) {
      const plan = plans.get(input.id)!;
      output.set(input.id, {
        modelVersion: FORECAST_MODEL_VERSION,
        confidence: plan.confidence,
        forecasts: plan.forecasts,
        metadata: { method: 'weighted-moving-average' },
        plan,
      });
    }
    return output;
  }

  try {
    const response = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, '')}/forecast/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        series: inputs.map((input) => ({
          id: input.id,
          horizon_days: input.horizonDays,
          history: input.historyDates.map((date, index) => ({
            date,
            quantity: input.history[index] ?? 0,
          })),
        })),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`ML service returned ${response.status}`);
    }
    const body = (await response.json()) as { results: Array<{ id: string } & RemoteForecast> };
    const byId = new Map(body.results.map((row) => [row.id, row]));
    for (const input of inputs) {
      const plan = plans.get(input.id)!;
      const remote = byId.get(input.id);
      if (!remote) {
        output.set(input.id, {
          modelVersion: FORECAST_MODEL_VERSION,
          confidence: plan.confidence,
          forecasts: plan.forecasts,
          metadata: { method: 'weighted-moving-average', fallback: true },
          plan,
        });
        continue;
      }
      output.set(input.id, {
        modelVersion: ML_MODEL_VERSION,
        confidence: remote.confidence,
        forecasts: remote.forecast.map((day) => ({
          date: day.date,
          predictedDemand: day.predictedDemand,
          lowerBound: day.lowerBound ?? day.predictedDemand,
          upperBound: day.upperBound ?? day.predictedDemand,
        })),
        metadata: remote.metadata ?? { method: 'hist-gradient-boosting' },
        plan,
      });
    }
    return output;
  } catch (error) {
    logger.warn({ err: error }, 'Python forecast batch failed; using baseline');
    for (const input of inputs) {
      const plan = plans.get(input.id)!;
      output.set(input.id, {
        modelVersion: FORECAST_MODEL_VERSION,
        confidence: plan.confidence,
        forecasts: plan.forecasts,
        metadata: { method: 'weighted-moving-average', fallback: true },
        plan,
      });
    }
    return output;
  }
}

export async function projectDemand(
  input: Parameters<BaselineForecastProvider['project']>[0],
): Promise<ForecastProjection & { plan: ReturnType<typeof buildPositionPlan> }> {
  const plan = buildPositionPlan(input);
  const provider = getForecastProvider();
  if (provider.name === 'baseline') {
    return {
      modelVersion: FORECAST_MODEL_VERSION,
      confidence: plan.confidence,
      forecasts: plan.forecasts,
      metadata: { method: 'weighted-moving-average' },
      plan,
    };
  }
  try {
    const remote = await provider.project(input);
    return { ...remote, plan };
  } catch (error) {
    logger.warn({ err: error }, 'Python forecast provider failed; using baseline');
    return {
      modelVersion: FORECAST_MODEL_VERSION,
      confidence: plan.confidence,
      forecasts: plan.forecasts,
      metadata: { method: 'weighted-moving-average', fallback: true },
      plan,
    };
  }
}
