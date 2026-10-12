import { z } from 'zod';
import { can } from '../../config/permissions';
import { cols, countDocs, findMany, findOne, insertOne, patchOne, withTransaction } from '../../db/mongo';
import type { InventoryDoc, ProductDoc, SaleDoc, WarehouseDoc } from '../../domain/documents';
import type { UserRole } from '../../domain/enums';
import { publishEvent } from '../../events/publisher';
import { DomainEventName } from '../../events/types';
import { AuditAction, recordAudit } from '../../lib/audit';
import { AppError, conflict, forbidden, notFound } from '../../utils/errors';
import { decimalToString, toDecimal } from '../../utils/money';
import { toPagination, toSkip } from '../../utils/pagination';
import type { createSaleSchema, listSalesSchema } from './sales.schema';

type ListQuery = z.infer<typeof listSalesSchema>['query'];
type CreateBody = z.infer<typeof createSaleSchema>['body'];

export function toSale(sale: SaleDoc, remainingQuantity?: number) {
  return {
    id: sale.id,
    organizationId: sale.organizationId,
    productId: sale.productId,
    warehouseId: sale.warehouseId,
    recordedById: sale.recordedById,
    quantity: sale.quantity,
    unitPrice: decimalToString(sale.unitPrice),
    totalAmount: decimalToString(sale.totalAmount),
    channel: sale.channel,
    soldAt: sale.soldAt,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    ...(remainingQuantity !== undefined ? { remainingQuantity } : {}),
  };
}

export async function listSales(organizationId: string, query: ListQuery) {
  const filter = {
    organizationId,
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.from || query.to
      ? {
          soldAt: {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    countDocs(cols.sales, filter),
    findMany<SaleDoc>(cols.sales, filter, {
      sort: { soldAt: -1 },
      skip: toSkip(query.page, query.limit),
      limit: query.limit,
    }),
  ]);
  return { items: rows.map((row) => toSale(row)), pagination: toPagination(query.page, query.limit, total) };
}

export async function recordSale(organizationId: string, userId: string, role: UserRole, input: CreateBody) {
  if (input.allowNegative && !can(role, 'sales', 'approve')) {
    throw forbidden('Only owners and admins can record sales that drive inventory negative');
  }

  const sale = await withTransaction(async () => {
    const product = await findOne<ProductDoc>(cols.products, { _id: input.productId, organizationId });
    if (!product) {
      throw notFound('Product not found');
    }
    if (product.status !== 'ACTIVE') {
      throw conflict('PRODUCT_INACTIVE', 'Cannot record a sale for an inactive product');
    }
    const warehouse = await findOne<WarehouseDoc>(cols.warehouses, { _id: input.warehouseId, organizationId });
    if (!warehouse) {
      throw notFound('Warehouse not found');
    }
    const inventory = await findOne<InventoryDoc>(cols.inventory, {
      organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
    });
    if (!inventory) {
      throw notFound('Inventory not found for this product and warehouse');
    }

    const updated = await patchOne(
      cols.inventory,
      {
        _id: inventory.id,
        organizationId,
        ...(input.allowNegative ? {} : { quantity: { $gte: input.quantity } }),
      },
      {},
      { $inc: { quantity: -input.quantity } },
    );
    if (updated === 0) {
      throw conflict('INSUFFICIENT_STOCK', 'Not enough inventory to record this sale');
    }

    const unitPrice = input.unitPrice ?? decimalToString(product.sellingPrice);
    const totalAmount = toDecimal(unitPrice).mul(input.quantity).toFixed(2);
    const created = await insertOne<SaleDoc>(cols.sales, {
      organizationId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      recordedById: userId,
      quantity: input.quantity,
      unitPrice,
      totalAmount,
      channel: input.channel ?? 'quick-commerce',
      soldAt: input.soldAt ?? new Date(),
    });
    const fresh = await findOne<InventoryDoc>(cols.inventory, { _id: inventory.id, organizationId });
    await recordAudit({
      organizationId,
      userId,
      action: AuditAction.SALE_RECORDED,
      entityType: 'Sale',
      entityId: created.id,
      metadata: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        previousQuantity: inventory.quantity,
        remainingQuantity: fresh?.quantity ?? null,
        allowNegative: Boolean(input.allowNegative),
      },
    });
    return toSale(created, fresh?.quantity);
  });

  void publishEvent({
    name: DomainEventName.SALE_RECORDED,
    organizationId,
    entityType: 'Sale',
    entityId: sale.id,
    payload: { quantity: sale.quantity, productId: sale.productId, warehouseId: sale.warehouseId },
  });
  return sale;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export async function importSales(organizationId: string, userId: string, role: UserRole, csv: string) {
  const lines = csv
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw conflict('EMPTY_IMPORT', 'The file needs a header row and at least one sale');
  }
  const header = splitCsvLine(lines[0] ?? '').map((cell) => cell.toLowerCase());
  const indexOf = (name: string) => header.indexOf(name);
  const required = ['sku', 'warehouse', 'quantity', 'soldat'];
  const missing = required.filter((name) => indexOf(name) < 0);
  if (missing.length > 0) {
    throw conflict('INVALID_HEADER', `Missing columns: ${missing.join(', ')}. Expected sku, warehouse, quantity, soldAt`);
  }
  if (lines.length - 1 > 2000) {
    throw conflict('IMPORT_TOO_LARGE', 'Import at most 2000 sales at a time');
  }

  const [products, warehouses] = await Promise.all([
    findMany<ProductDoc>(cols.products, { organizationId }),
    findMany<WarehouseDoc>(cols.warehouses, { organizationId }),
  ]);
  const productBySku = new Map(products.map((product) => [product.sku.toLowerCase(), product]));
  const warehouseByCode = new Map(warehouses.map((warehouse) => [warehouse.code.toLowerCase(), warehouse]));

  let created = 0;
  const errors: Array<{ line: number; message: string }> = [];
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex += 1) {
    const cells = splitCsvLine(lines[rowIndex] ?? '');
    const sku = cells[indexOf('sku')] ?? '';
    const warehouseCode = cells[indexOf('warehouse')] ?? '';
    const quantity = Number(cells[indexOf('quantity')]);
    const soldAtRaw = cells[indexOf('soldat')] ?? '';
    const channel = indexOf('channel') >= 0 ? cells[indexOf('channel')] : undefined;
    const unitPrice = indexOf('unitprice') >= 0 ? cells[indexOf('unitprice')] : undefined;
    const product = productBySku.get(sku.toLowerCase());
    const warehouse = warehouseByCode.get(warehouseCode.toLowerCase());
    const soldAt = new Date(soldAtRaw);
    if (!product || !warehouse || !Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(soldAt.getTime())) {
      errors.push({ line: rowIndex + 1, message: 'Unknown SKU, warehouse code, quantity, or date' });
      continue;
    }
    try {
      await recordSale(organizationId, userId, role, {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity,
        ...(unitPrice ? { unitPrice } : {}),
        ...(channel ? { channel } : {}),
        soldAt,
      });
      created += 1;
    } catch (error) {
      errors.push({
        line: rowIndex + 1,
        message: error instanceof AppError ? error.message : 'Could not record this sale',
      });
    }
  }
  return { created, failed: errors.length, errors: errors.slice(0, 20) };
}
