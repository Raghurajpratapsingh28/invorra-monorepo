/**
 * Inventory health thresholds.
 * LOW:      days > 14
 * MEDIUM:   7 < days <= 14
 * HIGH:     3 < days <= 7
 * CRITICAL: days <= 3
 */
export const RISK_THRESHOLDS = {
  criticalMaxDays: 3,
  highMaxDays: 7,
  mediumMaxDays: 14,
} as const;

/** Window used to estimate average daily demand from sales history. */
export const DEMAND_LOOKBACK_DAYS = 28;

/** Target on-hand cover when generating a replenishment recommendation. */
export const REPLENISHMENT_TARGET_COVER_DAYS = 21;

/** How long a pending recommendation stays actionable. */
export const RECOMMENDATION_TTL_DAYS = 7;

/** Baseline forecast horizon produced by the moving-average model. */
export const FORECAST_HORIZON_DAYS = 14;

/** Planning window used when sizing a replenishment order. */
export const PLANNING_HORIZON_DAYS = FORECAST_HORIZON_DAYS;

export const FORECAST_MODEL_VERSION = 'weighted-ma-v1';

/**
 * Weights for the baseline daily forecast.
 * They must sum to 1. Recent demand is weighted more heavily than the 30-day average.
 */
export const FORECAST_WEIGHTS = {
  sevenDay: 0.5,
  fourteenDay: 0.3,
  thirtyDay: 0.2,
} as const;

export const MOVING_AVERAGE_WINDOWS = {
  seven: 7,
  fourteen: 14,
  thirty: 30,
} as const;

/**
 * Standard-normal z for safety stock. 1.65 is about a 95% cycle service level.
 * safetyStock = z × dailyStdDev × sqrt(leadTimeDays)
 */
export const SERVICE_LEVEL_Z = 1.65;
