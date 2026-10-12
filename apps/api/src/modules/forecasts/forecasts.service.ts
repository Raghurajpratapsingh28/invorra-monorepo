import { z } from 'zod';
import {
  FORECAST_HORIZON_DAYS,
  FORECAST_MODEL_VERSION,
  FORECAST_WEIGHTS,
  MOVING_AVERAGE_WINDOWS,
} from '../../config/business';
import {
  cols,
  countDocs,
  findMany,
  findOne,
  insertMany,
  insertOne,
  mapByIds,
  newId,
  patchOne,
  removeMany,
  withTransaction,
} from '../../db/mongo';
import type { ForecastDoc, InventoryDoc, ProductDoc, WarehouseDoc } from '../../domain/documents';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { startOfUtcDay } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { decimalToString } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import { loadDailyDemand, seriesFor } from '../intelligence/history';
import { fetchModelCard, projectBatch } from './forecast-provider';
import type { createForecastSchema, listForecastsSchema } from './forecasts.schema';

type ListQuery = z.infer<typeof listForecastsSchema>['query'];
type CreateBody = z.infer<typeof createForecastSchema>['body'];

type ForecastView = ForecastDoc & {
  product?: Pick<ProductDoc, 'id' | 'sku' | 'name'>;
  warehouse?: Pick<WarehouseDoc, 'id' | 'code' | 'name' | 'city'>;
};

async function hydrate(rows: ForecastDoc[], include = true): Promise<ForecastView[]> {
  if (!include) return rows;
  const [products, warehouses] = await Promise.all([
    mapByIds<ProductDoc>(cols.products, rows.map((row) => row.productId)),
    mapByIds<WarehouseDoc>(cols.warehouses, rows.map((row) => row.warehouseId)),
  ]);
  return rows.map((row) => {
    const product = products.get(row.productId);
    const warehouse = warehouses.get(row.warehouseId);
    return {
      ...row,
      ...(product ? { product: { id: product.id, sku: product.sku, name: product.name } } : {}),
      ...(warehouse
        ? { warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name, city: warehouse.city } }
        : {}),
    };
  });
}

export function toForecast(row: ForecastView) {
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
    product: row.product,
    warehouse: row.warehouse,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listForecasts(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.from || query.to
      ? {
          forecastDate: {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.forecasts, filter),
    findMany<ForecastDoc>(cols.forecasts, filter, {
      sort: { forecastDate: 1, productId: 1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }).then((found) => hydrate(found)),
  ]);
  return { items: rows.map(toForecast), pagination: toPagination(query.page, query.limit, total) };
}

export async function createForecast(organizationId: string, userId: string, input: CreateBody) {
  const [product, warehouse] = await Promise.all([
    findOne<ProductDoc>(cols.products, { _id: input.productId, organizationId }),
    findOne<WarehouseDoc>(cols.warehouses, { _id: input.warehouseId, organizationId }),
  ]);
  if (!product) throw notFound('Product not found');
  if (!warehouse) throw notFound('Warehouse not found');
  const forecastDate = startOfUtcDay(input.forecastDate);
  const forecast = await withTransaction(async () => {
    const existing = await findOne<ForecastDoc>(cols.forecasts, {
      organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      forecastDate,
      modelVersion: 'manual',
    });
    const saved = existing
      ? await (async () => {
          await patchOne(cols.forecasts, { _id: existing.id }, {
            predictedDemand: input.predictedDemand,
            lowerBound: input.lowerBound ?? null,
            upperBound: input.upperBound ?? null,
            confidence: '1.0000',
          });
          const fresh = await findOne<ForecastDoc>(cols.forecasts, { _id: existing.id });
          if (!fresh) throw notFound('Forecast not found');
          return fresh;
        })()
      : await insertOne<ForecastDoc>(cols.forecasts, {
            organizationId,
            productId: input.productId,
            warehouseId: input.warehouseId,
            forecastDate,
            predictedDemand: input.predictedDemand,
            lowerBound: input.lowerBound ?? null,
            upperBound: input.upperBound ?? null,
            confidence: '1.0000',
            modelVersion: 'manual',
          });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.FORECAST_CREATED,
      entityType: 'Forecast',
      entityId: saved.id,
      metadata: { productId: input.productId, warehouseId: input.warehouseId },
    });
    return saved;
  });
  const [view] = await hydrate([forecast]);
  return toForecast(view ?? forecast);
}

export async function getForecast(organizationId: string, id: string) {
  const forecast = await findOne<ForecastDoc>(cols.forecasts, { _id: id, organizationId });
  if (!forecast) throw notFound('Forecast not found');
  const [view] = await hydrate([forecast]);
  return toForecast(view ?? forecast);
}

export async function generateForecasts(organizationId: string, userId: string) {
  const inventory = await findMany<InventoryDoc>(cols.inventory, { organizationId });
  const products = await mapByIds<ProductDoc>(
    cols.products,
    inventory.map((row) => row.productId),
  );
  const positions = inventory.filter((row) => products.get(row.productId)?.status === 'ACTIVE');
  const history = await loadDailyDemand(organizationId);
  const projections = await projectBatch(
    positions.map((position) => ({
      id: `${position.productId}:${position.warehouseId}`,
      history: seriesFor(history.byPosition, position.productId, position.warehouseId, history.dates),
      historyDates: history.dates,
      currentStock: position.quantity - position.reservedQty,
      leadTimeDays: products.get(position.productId)?.leadTimeDays ?? 0,
      moq: products.get(position.productId)?.moq ?? 1,
      horizonDays: FORECAST_HORIZON_DAYS,
    })),
  );
  const rows = positions.flatMap((position) => {
    const projection = projections.get(`${position.productId}:${position.warehouseId}`);
    if (!projection) return [];
    return projection.forecasts.map((day) => ({
      id: newId(),
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
  const medianMape = mapes.length ? [...mapes].sort((left, right) => left - right)[Math.floor(mapes.length / 2)] : null;
  const modelVersion = rows[0]?.modelVersion ?? FORECAST_MODEL_VERSION;
  const horizonStart = rows[0]?.forecastDate;
  const horizonEnd = rows[rows.length - 1]?.forecastDate;

  const created = await withTransaction(async () => {
    await removeMany(cols.forecasts, {
      organizationId,
      modelVersion: { $in: [FORECAST_MODEL_VERSION, 'gbm-demand-v1', 'gbm-demand-v2'] },
      ...(horizonStart && horizonEnd ? { forecastDate: { $gte: horizonStart, $lte: horizonEnd } } : {}),
    });
    if (rows.length > 0) {
      await insertMany<ForecastDoc>(cols.forecasts, rows);
    }
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.FORECAST_GENERATED,
      entityType: 'Forecast',
      metadata: { created: rows.length, horizonDays: FORECAST_HORIZON_DAYS, modelVersion, medianMape, weights: FORECAST_WEIGHTS },
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
    metrics: { medianMape, series: projections.size },
  };
}

export async function getForecastModel() {
  try {
    return await fetchModelCard();
  } catch {
    return { name: FORECAST_MODEL_VERSION, algorithm: 'Weighted moving average', active: false, unavailable: true };
  }
}
