import { Prisma } from '@prisma/client';
import { MOVING_AVERAGE_WINDOWS } from '../../config/business';
import { prisma } from '../../lib/prisma';
import { addUtcDays, startOfUtcDay } from '../../utils/dates';
import { calendarDatesEnding } from './planner';

type DailyRow = {
  productId: string;
  warehouseId: string;
  day: string;
  quantity: number;
};

export async function loadDailyDemand(
  organizationId: string,
  filters: { productId?: string; warehouseId?: string } = {},
) {
  const end = startOfUtcDay(new Date());
  const start = addUtcDays(end, -(MOVING_AVERAGE_WINDOWS.thirty - 1));
  const productFilter = filters.productId
    ? Prisma.sql`AND "productId" = ${filters.productId}`
    : Prisma.empty;
  const warehouseFilter = filters.warehouseId
    ? Prisma.sql`AND "warehouseId" = ${filters.warehouseId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<DailyRow[]>`
    SELECT "productId",
           "warehouseId",
           to_char(("soldAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day,
           SUM("quantity")::int AS quantity
    FROM "Sale"
    WHERE "organizationId" = ${organizationId}
      AND "soldAt" >= ${start}
      ${productFilter}
      ${warehouseFilter}
    GROUP BY "productId", "warehouseId", day
  `;

  const byPosition = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = `${row.productId}:${row.warehouseId}`;
    const days = byPosition.get(key) ?? new Map<string, number>();
    days.set(String(row.day), Number(row.quantity));
    byPosition.set(key, days);
  }

  const dates = calendarDatesEnding(end.toISOString().slice(0, 10), MOVING_AVERAGE_WINDOWS.thirty);
  return { dates, byPosition };
}

export function seriesFor(
  byPosition: Map<string, Map<string, number>>,
  productId: string,
  warehouseId: string,
  dates: string[],
): number[] {
  const days = byPosition.get(`${productId}:${warehouseId}`);
  return dates.map((date) => days?.get(date) ?? 0);
}
