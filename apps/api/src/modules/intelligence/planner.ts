import { RiskLevel } from '@prisma/client';
import {
  FORECAST_WEIGHTS,
  MOVING_AVERAGE_WINDOWS,
  PLANNING_HORIZON_DAYS,
  SERVICE_LEVEL_Z,
} from '../../config/business';
import { classifyRisk, daysOfInventory, riskRank, roundTo } from '../../utils/risk';

export type ForecastWeights = {
  sevenDay: number;
  fourteenDay: number;
  thirtyDay: number;
};

export type DailyForecast = {
  date: string;
  predictedDemand: number;
  lowerBound: number;
  upperBound: number;
};

export type PositionPlan = {
  ma7: number;
  ma14: number;
  ma30: number;
  baseline: number;
  dailyStdDev: number;
  confidence: number;
  seasonalIndex: number[];
  forecasts: DailyForecast[];
  horizonForecastDemand: number;
  leadTimeDemand: number;
  daysOfInventory: number | null;
  stockoutProbability: number;
  riskLevel: RiskLevel;
  safetyStock: number;
  requiredStock: number;
  rawOrderQuantity: number;
  recommendedQty: number;
  explanation: string;
};

export function addIsoDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function utcDayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00.000Z`).getUTCDay();
}

export function calendarDatesEnding(endIso: string, days: number): string[] {
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(addIsoDays(endIso, -offset));
  }
  return dates;
}

export function movingAverage(history: number[], window: number): number {
  if (window <= 0) {
    return 0;
  }
  const slice = history.slice(-window);
  const total = slice.reduce((sum, value) => sum + value, 0);
  return total / window;
}

export function sampleStdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Deterministic confidence in [0, 1].
 * Half comes from how many days in the last two weeks actually sold.
 * Half comes from stability: 1 / (1 + coefficient of variation).
 * A series of zeros has confidence 0 because there is no demand signal.
 */
export function forecastConfidence(history: number[]): number {
  if (history.length === 0 || history.every((value) => value <= 0)) {
    return 0;
  }
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const nonZeroDays = history.filter((value) => value > 0).length;
  const coverage = Math.min(1, nonZeroDays / MOVING_AVERAGE_WINDOWS.fourteen);
  const deviation = sampleStdDev(history);
  const coefficient = mean > 0 ? deviation / mean : 0;
  const stability = 1 / (1 + coefficient);
  return roundTo(0.5 * coverage + 0.5 * stability, 4);
}

export function seasonalIndexes(history: number[], dates: string[]): number[] {
  const sums = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  history.forEach((quantity, index) => {
    const date = dates[index];
    if (!date) {
      return;
    }
    const dow = utcDayOfWeek(date);
    const bucket = sums[dow];
    const seen = counts[dow];
    if (bucket === undefined || seen === undefined) {
      return;
    }
    sums[dow] = bucket + quantity;
    counts[dow] = seen + 1;
  });
  const overall = history.length === 0 ? 0 : history.reduce((sum, value) => sum + value, 0) / history.length;
  return sums.map((sum, index) => {
    const seen = counts[index] ?? 0;
    if (seen === 0 || overall <= 0) {
      return 1;
    }
    return sum / seen / overall;
  });
}

export function weightedBaseline(history: number[], weights: ForecastWeights = FORECAST_WEIGHTS): number {
  return (
    weights.sevenDay * movingAverage(history, MOVING_AVERAGE_WINDOWS.seven) +
    weights.fourteenDay * movingAverage(history, MOVING_AVERAGE_WINDOWS.fourteen) +
    weights.thirtyDay * movingAverage(history, MOVING_AVERAGE_WINDOWS.thirty)
  );
}

/** Abramowitz and Stegun approximation of the standard normal CDF. */
export function normalCdf(x: number): number {
  if (x < -8) {
    return 0;
  }
  if (x > 8) {
    return 1;
  }
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const density = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const polynomial =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = density * polynomial;
  return x >= 0 ? 1 - tail : tail;
}

/**
 * Probability that lead-time demand exceeds available stock.
 * Lead-time demand is treated as normal with mean = sum of daily forecasts over the lead time
 * and stddev = dailyStdDev × sqrt(leadTime). If variability is zero, the result is 0 or 1.
 */
export function stockoutProbability(input: {
  availableStock: number;
  leadTimeDays: number;
  leadTimeDemand: number;
  dailyStdDev: number;
}): number {
  const leadTime = Math.max(0, input.leadTimeDays);
  const mean = Math.max(0, input.leadTimeDemand);
  if (leadTime === 0 || mean === 0) {
    return input.availableStock <= 0 && mean > 0 ? 1 : 0;
  }
  if (input.availableStock <= 0) {
    return 1;
  }
  const sigma = input.dailyStdDev * Math.sqrt(leadTime);
  if (sigma <= 0) {
    return input.availableStock >= mean ? 0 : 1;
  }
  const z = (input.availableStock - mean) / sigma;
  return roundTo(Math.min(1, Math.max(0, 1 - normalCdf(z))), 4);
}

export function safetyStockUnits(
  dailyStdDev: number,
  leadTimeDays: number,
  zScore = SERVICE_LEVEL_Z,
): number {
  if (dailyStdDev <= 0 || leadTimeDays <= 0 || zScore <= 0) {
    return 0;
  }
  return Math.ceil(zScore * dailyStdDev * Math.sqrt(leadTimeDays));
}

export function roundUpToMoq(quantity: number, moq: number): number {
  if (quantity <= 0) {
    return 0;
  }
  const size = Math.max(1, Math.floor(moq));
  return Math.ceil(quantity / size) * size;
}

export function composeOrder(input: {
  forecastDemand: number;
  safetyStock: number;
  currentStock: number;
  moq: number;
}) {
  const requiredStock = input.forecastDemand + input.safetyStock;
  const raw = requiredStock - input.currentStock;
  const rawOrderQuantity = raw > 0 ? Math.ceil(raw) : 0;
  const recommendedQty = roundUpToMoq(rawOrderQuantity, input.moq);
  return {
    requiredStock,
    rawOrderQuantity,
    recommendedQty,
    explanation: buildExplanation({
      recommendedQty,
      forecastDemand: input.forecastDemand,
      currentStock: input.currentStock,
      safetyStock: input.safetyStock,
      moq: Math.max(1, Math.floor(input.moq)),
    }),
  };
}

export function buildExplanation(input: {
  recommendedQty: number;
  forecastDemand: number;
  currentStock: number;
  safetyStock: number;
  moq: number;
}): string {
  const format = (value: number) => Math.round(value).toLocaleString('en-US');
  return `Recommended ${format(input.recommendedQty)} units because forecast demand for the planning horizon is ${format(input.forecastDemand)} units, current inventory is ${format(input.currentStock)} units, safety stock requirement is ${format(input.safetyStock)} units, and the order quantity was rounded to the supplier MOQ of ${format(input.moq)} units.`;
}

export function applyLeadTimeRisk(days: number | null, leadTimeDays: number): RiskLevel {
  if (days === null) {
    return RiskLevel.LOW;
  }
  const base = classifyRisk(days);
  if (leadTimeDays > 0 && days <= leadTimeDays && riskRank(base) > riskRank(RiskLevel.HIGH)) {
    return RiskLevel.HIGH;
  }
  return base;
}

export function buildPositionPlan(input: {
  history: number[];
  historyDates: string[];
  currentStock: number;
  leadTimeDays: number;
  moq: number;
  horizonDays?: number;
  weights?: ForecastWeights;
}): PositionPlan {
  const horizonDays = input.horizonDays ?? PLANNING_HORIZON_DAYS;
  const history = input.history;
  const dates = input.historyDates;
  const baseline = weightedBaseline(history, input.weights);
  const deviation = sampleStdDev(history);
  const seasonal = seasonalIndexes(history, dates);
  const confidence = forecastConfidence(history);
  const lastDate = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
  const projectionLength = Math.max(horizonDays, Math.max(0, input.leadTimeDays), 1);
  const projected: DailyForecast[] = [];

  for (let offset = 1; offset <= projectionLength; offset += 1) {
    const date = addIsoDays(lastDate, offset);
    const index = seasonal[utcDayOfWeek(date)] ?? 1;
    const predicted = Math.max(0, baseline * index);
    projected.push({
      date,
      predictedDemand: roundTo(predicted, 2),
      lowerBound: roundTo(Math.max(0, predicted - deviation), 2),
      upperBound: roundTo(predicted + deviation, 2),
    });
  }

  const forecasts = projected.slice(0, horizonDays);
  const horizonForecastDemand = roundTo(
    forecasts.reduce((sum, day) => sum + day.predictedDemand, 0),
    2,
  );
  const leadSlice = projected.slice(0, Math.max(0, input.leadTimeDays));
  const leadTimeDemand = roundTo(leadSlice.reduce((sum, day) => sum + day.predictedDemand, 0), 2);
  const lookback = history.slice(-28);
  const averageDailyDemand =
    lookback.length === 0 ? 0 : lookback.reduce((sum, value) => sum + value, 0) / 28;
  const cover = daysOfInventory(input.currentStock, averageDailyDemand);
  const probability = stockoutProbability({
    availableStock: input.currentStock,
    leadTimeDays: input.leadTimeDays,
    leadTimeDemand,
    dailyStdDev: deviation,
  });
  const safetyStock = safetyStockUnits(deviation, input.leadTimeDays);
  const order = composeOrder({
    forecastDemand: horizonForecastDemand,
    safetyStock,
    currentStock: input.currentStock,
    moq: input.moq,
  });

  return {
    ma7: roundTo(movingAverage(history, MOVING_AVERAGE_WINDOWS.seven), 4),
    ma14: roundTo(movingAverage(history, MOVING_AVERAGE_WINDOWS.fourteen), 4),
    ma30: roundTo(movingAverage(history, MOVING_AVERAGE_WINDOWS.thirty), 4),
    baseline: roundTo(baseline, 4),
    dailyStdDev: roundTo(deviation, 4),
    confidence,
    seasonalIndex: seasonal.map((value) => roundTo(value, 4)),
    forecasts,
    horizonForecastDemand,
    leadTimeDemand,
    daysOfInventory: cover === null ? null : roundTo(cover, 2),
    stockoutProbability: probability,
    riskLevel: applyLeadTimeRisk(cover, input.leadTimeDays),
    safetyStock,
    requiredStock: roundTo(order.requiredStock, 2),
    rawOrderQuantity: order.rawOrderQuantity,
    recommendedQty: order.recommendedQty,
    explanation: order.explanation,
  };
}
