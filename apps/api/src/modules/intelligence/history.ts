import { MOVING_AVERAGE_WINDOWS } from '../../config/business';
import { aggregate, cols } from '../../db/mongo';
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
  const rows = await aggregate<{ _id: { productId: string; warehouseId: string; day: string }; quantity: number }>(
    cols.sales,
    [
      {
        $match: {
          organizationId,
          soldAt: { $gte: start },
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
        },
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            warehouseId: '$warehouseId',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$soldAt', timezone: 'UTC' } },
          },
          quantity: { $sum: '$quantity' },
        },
      },
    ],
  );

  const byPosition = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const daily: DailyRow = {
      productId: row._id.productId,
      warehouseId: row._id.warehouseId,
      day: row._id.day,
      quantity: Number(row.quantity),
    };
    const key = `${daily.productId}:${daily.warehouseId}`;
    const days = byPosition.get(key) ?? new Map<string, number>();
    days.set(daily.day, daily.quantity);
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
