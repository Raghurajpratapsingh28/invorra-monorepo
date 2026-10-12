import { Forecast, Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  FORECAST_HORIZON_DAYS,
  FORECAST_MODEL_VERSION,
  FORECAST_WEIGHTS,
  MOVING_AVERAGE_WINDOWS,
} from '../../config/business';
import { AuditAction, recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { startOfUtcDay } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { DomainEventName } from '../../events/types';
import { publishEvent } from '../../events/publisher';
import { loadDailyDemand, seriesFor } from '../intelligence/history';
import { fetchModelCard, projectBatch } from './forecast-provider';
import type { createForecastSchema, listForecastsSchema } from './forecasts.schema';

type ListQuery = z.infer<typeof listForecastsSchema>['query'];
type CreateBody = z.infer<typeof createForecastSchema>['body'];

const forecastInclude = {
  product: { select: { id: true, sku: true, name: true } },
  warehouse: { select: { id: true, code: true, name: true, city: true } },
} satisfies Prisma.ForecastInclude;

type ForecastRow = Prisma.ForecastGetPayload<{ include: typeof forecastInclude }>;

export function toForecast(row: ForecastRow | Forecast) {
  const product = 'product' in row ? row.product : undefined;
  const warehouse = 'warehouse' in row ? row.warehouse : undefined;
  return {
    id: row.id,
    organizationId: row.organizationId,
    productId: row.productId,
    warehouseId: row.warehouseId,
    forecastDate: row.forecastDate,
    predictedDemand: decimalToString(row.predictedDemand),
    lowerBound: row.lowerBound ? decimalToString(row.lowerBound) : null,
    upperBound: row.upperBound ? decimalToString(row.upperBound) : null,
    confidence: decimalToString(row.confidence),
    modelVersion: row.modelVersion,
    product,
    warehouse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listForecasts(organizationId: string, query: ListQuery) {
  const where: Prisma.ForecastWhereInput = {
    organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.from || query.to
      ? {
          forecastDate: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.forecast.count({ where }),
    prisma.forecast.findMany({
      where,
      include: forecastInclude,
      orderBy: [{ forecastDate: 'asc' }, { productId: 'asc' }],
      skip: toSkip(query.page, query.limit),
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(toForecast),
    pagination: toPagination(query.page, query.limit, total),
  };
}

export async function createForecast(organizationId: string, userId: string, input: CreateBody) {
  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({
      where: { id: input.productId, organizationId },
      select: { id: true },
    }),
    prisma.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId },
      select: { id: true },
    }),
  ]);
  if (!product) {
    throw notFound('Product not found');
  }
  if (!warehouse) {
    throw notFound('Warehouse not found');
  }

  const forecastDate = startOfUtcDay(input.forecastDate);
  const forecast = await prisma.$transaction(async (tx) => {
    const saved = await tx.forecast.upsert({
      where: {
        organizationId_productId_warehouseId_forecastDate_modelVersion: {
          organizationId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          forecastDate,
          modelVersion: 'manual',
        },
      },
      create: {
        organizationId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        forecastDate,
        predictedDemand: input.predictedDemand,
        lowerBound: input.lowerBound ?? null,
        upperBound: input.upperBound ?? null,
        confidence: '1.0000',
        modelVersion: 'manual',
      },
      update: {
        predictedDemand: input.predictedDemand,
        lowerBound: input.lowerBound ?? null,
        upperBound: input.upperBound ?? null,
        confidence: '1.0000',
      },
    });

    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.FORECAST_CREATED,
      entityType: 'Forecast',
      entityId: saved.id,
      metadata: { productId: input.productId, warehouseId: input.warehouseId },
    });
    return saved;
  });

  return toForecast(forecast);
}

export async function getForecast(organizationId: string, id: string) {
  const forecast = await prisma.forecast.findFirst({
    where: { id, organizationId },
    include: forecastInclude,
  });
  if (!forecast) {
    throw notFound('Forecast not found');
  }
  return toForecast(forecast);
}

export async function generateForecasts(organizationId: string, userId: string) {
  const positions = await prisma.inventory.findMany({
    where: { organizationId, product: { status: 'ACTIVE' } },
    select: {
      productId: true,
      warehouseId: true,
      quantity: true,
      reservedQty: true,
      product: { select: { leadTimeDays: true, moq: true } },
    },
  });
  const history = await loadDailyDemand(organizationId);
  const projections = await projectBatch(
    positions.map((position) => ({
      id: `${position.productId}:${position.warehouseId}`,
      history: seriesFor(history.byPosition, position.productId, position.warehouseId, history.dates),
      historyDates: history.dates,
      currentStock: position.quantity - position.reservedQty,
      leadTimeDays: position.product.leadTimeDays,
      moq: position.product.moq,
      horizonDays: FORECAST_HORIZON_DAYS,
    })),
  );
  const rows = positions.flatMap((position) => {
    const projection = projections.get(`${position.productId}:${position.warehouseId}`);
    if (!projection) {
      return [];
    }
    return projection.forecasts.map((day) => ({
      organizationId,
      productId: position.productId,
      warehouseId: position.warehouseId,
      forecastDate: new Date(`${day.date}T00:00:00.000Z`),
      predictedDemand: day.predictedDemand.toFixed(2),
      lowerBound: day.lowerBound.toFixed(2),
      upperBound: day.upperBound.toFixed(2),
      confidence: projection.confidence.toFixed(4),
      modelVersion: projection.modelVersion,
    }));
  });
  const mapes = [...projections.values()]
    .map((projection) => projection.metadata.metrics)
    .filter((metrics): metrics is { mape?: number | null } => typeof metrics === 'object' && metrics !== null)
    .map((metrics) => metrics.mape)
    .filter((value): value is number => typeof value === 'number');
  const medianMape = mapes.length
    ? [...mapes].sort((left, right) => left - right)[Math.floor(mapes.length / 2)]
    : null;
  const modelVersion = rows[0]?.modelVersion ?? FORECAST_MODEL_VERSION;
  const horizonStart = rows[0]?.forecastDate;
  const horizonEnd = rows[rows.length - 1]?.forecastDate;

  const created = await prisma.$transaction(async (tx) => {
    await tx.forecast.deleteMany({
      where: {
        organizationId,
        modelVersion: { in: [FORECAST_MODEL_VERSION, 'gbm-demand-v1', 'gbm-demand-v2'] },
        ...(horizonStart && horizonEnd
          ? { forecastDate: { gte: horizonStart, lte: horizonEnd } }
          : {}),
      },
    });
    if (rows.length > 0) {
      await tx.forecast.createMany({ data: rows });
    }
    await recordAudit(tx, {
      organizationId,
      userId,
      action: AuditAction.FORECAST_GENERATED,
      entityType: 'Forecast',
      metadata: {
        created: rows.length,
        horizonDays: FORECAST_HORIZON_DAYS,
        modelVersion,
        medianMape,
        weights: FORECAST_WEIGHTS,
      },
    });
    return rows.length;
  });

  void publishEvent({
    name: DomainEventName.FORECAST_GENERATED,
    organizationId,
    entityType: 'Forecast',
    payload: { created },
  });

  return {
    created,
    modelVersion,
    horizonDays: FORECAST_HORIZON_DAYS,
    lookbackDays: MOVING_AVERAGE_WINDOWS.thirty,
    metrics: {
      medianMape,
      series: projections.size,
    },
  };
}

export async function getForecastModel() {
  try {
    return await fetchModelCard();
  } catch {
    return {
      name: FORECAST_MODEL_VERSION,
      algorithm: 'Weighted moving average',
      active: false,
      unavailable: true,
    };
  }
}
