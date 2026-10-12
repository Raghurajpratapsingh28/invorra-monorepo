import { RiskLevel } from '@prisma/client';
import { RISK_THRESHOLDS } from '../config/business';

export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Days of cover. Null means demand is zero while stock remains, so cover is unbounded.
 * Zero demand and zero stock is treated as 0 days (critical).
 */
export function daysOfInventory(currentStock: number, averageDailyDemand: number): number | null {
  if (averageDailyDemand <= 0) {
    return currentStock > 0 ? null : 0;
  }
  return currentStock / averageDailyDemand;
}

export function classifyRisk(days: number): RiskLevel {
  if (!Number.isFinite(days) || days > RISK_THRESHOLDS.mediumMaxDays) {
    return RiskLevel.LOW;
  }
  if (days <= RISK_THRESHOLDS.criticalMaxDays) {
    return RiskLevel.CRITICAL;
  }
  if (days <= RISK_THRESHOLDS.highMaxDays) {
    return RiskLevel.HIGH;
  }
  return RiskLevel.MEDIUM;
}

export function riskRank(level: RiskLevel): number {
  switch (level) {
    case RiskLevel.CRITICAL:
      return 0;
    case RiskLevel.HIGH:
      return 1;
    case RiskLevel.MEDIUM:
      return 2;
    default:
      return 3;
  }
}
