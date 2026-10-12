import 'dotenv/config';
import { Prisma, PrismaClient, ProductStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { buildPositionPlan, calendarDatesEnding } from '../apps/api/src/modules/intelligence/planner';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';
const DEMO_SLUG = 'nimbus-fmcg';
const LOOKBACK_DAYS = 28;
const HISTORY_DAYS = 90;

const DEMO_USERS = [
  { email: 'owner@nimbus.invorra', name: 'Nimbus Owner', role: UserRole.OWNER },
  { email: 'admin@nimbus.invorra', name: 'Nimbus Admin', role: UserRole.ADMIN },
  { email: 'operator@nimbus.invorra', name: 'Nimbus Operator', role: UserRole.OPERATOR },
  { email: 'viewer@nimbus.invorra', name: 'Nimbus Viewer', role: UserRole.VIEWER },
] as const;

type ProductDef = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  unitCost: string;
  sellingPrice: string;
  baseDaily: number;
  weekend: number;
  leadTimeDays: number;
};

const PRODUCTS: ProductDef[] = [
  { sku: 'NB-BHUJIA-150', name: 'Classic Aloo Bhujia 150g', category: 'Snacks', brand: 'Nimbus', unitCost: '42.00', sellingPrice: '65.00', baseDaily: 26, weekend: 1.35, leadTimeDays: 4 },
  { sku: 'NB-OATS-40', name: 'Masala Oats Cup 40g', category: 'Snacks', brand: 'Nimbus', unitCost: '18.00', sellingPrice: '30.00', baseDaily: 14, weekend: 0.9, leadTimeDays: 5 },
  { sku: 'NB-COFFEE-180', name: 'Cold Coffee Can 180ml', category: 'Beverages', brand: 'Nimbus', unitCost: '28.00', sellingPrice: '49.00', baseDaily: 22, weekend: 1.4, leadTimeDays: 4 },
  { sku: 'NB-YOGURT-100', name: 'Greek Yogurt 100g', category: 'Dairy', brand: 'Nimbus', unitCost: '22.00', sellingPrice: '40.00', baseDaily: 16, weekend: 1.15, leadTimeDays: 2 },
  { sku: 'NB-BREAD-400', name: 'Whole Wheat Bread 400g', category: 'Staples', brand: 'Nimbus', unitCost: '24.00', sellingPrice: '42.00', baseDaily: 20, weekend: 0.85, leadTimeDays: 1 },
  { sku: 'NB-MILK-500', name: 'Toned Milk 500ml', category: 'Dairy', brand: 'Nimbus', unitCost: '20.00', sellingPrice: '32.00', baseDaily: 34, weekend: 1.05, leadTimeDays: 1 },
  { sku: 'NB-RICE-1K', name: 'Basmati Rice 1kg', category: 'Staples', brand: 'Nimbus', unitCost: '95.00', sellingPrice: '145.00', baseDaily: 8, weekend: 1.2, leadTimeDays: 6 },
  { sku: 'NB-DAL-1K', name: 'Toor Dal 1kg', category: 'Staples', brand: 'Nimbus', unitCost: '110.00', sellingPrice: '165.00', baseDaily: 6, weekend: 1.15, leadTimeDays: 6 },
  { sku: 'NB-OIL-1L', name: 'Sunflower Oil 1L', category: 'Staples', brand: 'Nimbus', unitCost: '125.00', sellingPrice: '179.00', baseDaily: 7, weekend: 1.1, leadTimeDays: 5 },
  { sku: 'NB-HANDWASH-200', name: 'Hand Wash 200ml', category: 'Personal Care', brand: 'Nimbus', unitCost: '55.00', sellingPrice: '89.00', baseDaily: 9, weekend: 1.05, leadTimeDays: 7 },
  { sku: 'NB-DISH-500', name: 'Dishwash Gel 500ml', category: 'Home Care', brand: 'Nimbus', unitCost: '70.00', sellingPrice: '115.00', baseDaily: 8, weekend: 1.1, leadTimeDays: 7 },
  { sku: 'NB-NOODLE-70', name: 'Masala Instant Noodles 70g', category: 'Snacks', brand: 'Nimbus', unitCost: '8.50', sellingPrice: '15.00', baseDaily: 30, weekend: 1.25, leadTimeDays: 4 },
  { sku: 'NB-BAR-50', name: 'Protein Bar 50g', category: 'Snacks', brand: 'Nimbus', unitCost: '35.00', sellingPrice: '60.00', baseDaily: 4, weekend: 1.3, leadTimeDays: 8 },
  { sku: 'NB-SPARK-750', name: 'Sparkling Water 750ml', category: 'Beverages', brand: 'Nimbus', unitCost: '18.00', sellingPrice: '35.00', baseDaily: 11, weekend: 1.45, leadTimeDays: 5 },
  { sku: 'NB-KETCHUP-500', name: 'Tomato Ketchup 500g', category: 'Staples', brand: 'Nimbus', unitCost: '62.00', sellingPrice: '99.00', baseDaily: 7, weekend: 1.2, leadTimeDays: 6 },
  { sku: 'NB-TEA-25', name: 'Green Tea Bags 25s', category: 'Beverages', brand: 'Nimbus', unitCost: '85.00', sellingPrice: '140.00', baseDaily: 3, weekend: 1.1, leadTimeDays: 8 },
  { sku: 'NB-FACE-50', name: 'Face Wash 50g', category: 'Personal Care', brand: 'Nimbus', unitCost: '75.00', sellingPrice: '129.00', baseDaily: 5, weekend: 1.15, leadTimeDays: 7 },
  { sku: 'NB-WIPES-20', name: 'Baby Wipes 20s', category: 'Personal Care', brand: 'Nimbus', unitCost: '48.00', sellingPrice: '79.00', baseDaily: 6, weekend: 1.05, leadTimeDays: 6 },
  { sku: 'NB-CHOCO-80', name: 'Dark Chocolate 80g', category: 'Snacks', brand: 'Nimbus', unitCost: '55.00', sellingPrice: '95.00', baseDaily: 10, weekend: 1.5, leadTimeDays: 5 },
  { sku: 'NB-UPMA-60', name: 'Ready-to-eat Upma 60g', category: 'Staples', brand: 'Nimbus', unitCost: '20.00', sellingPrice: '35.00', baseDaily: 5, weekend: 0.8, leadTimeDays: 6 },
];

const WAREHOUSES = [
  { name: 'Delhi FC', code: 'DEL-01', city: 'Delhi', state: 'Delhi', multiplier: 1.35, address: 'Okhla Industrial Area, New Delhi' },
  { name: 'Mumbai FC', code: 'BOM-01', city: 'Mumbai', state: 'Maharashtra', multiplier: 1.28, address: 'Bhiwandi Logistics Park, Thane' },
  { name: 'Bangalore FC', code: 'BLR-01', city: 'Bangalore', state: 'Karnataka', multiplier: 1.05, address: 'Whitefield, Bengaluru' },
  { name: 'Hyderabad FC', code: 'HYD-01', city: 'Hyderabad', state: 'Telangana', multiplier: 0.92, address: 'Shamshabad, Hyderabad' },
  { name: 'Kolkata FC', code: 'CCU-01', city: 'Kolkata', state: 'West Bengal', multiplier: 0.84, address: 'Dankuni, Hooghly' },
];

const SUPPLIERS = [
  { name: 'Northwind Distributors', code: 'SUP-NORTH', city: 'Delhi', email: 'orders@northwind.example', phone: '+91-11-4000-1001', leadTimeDays: 3 },
  { name: 'Harbour Wholesale', code: 'SUP-HARBOUR', city: 'Mumbai', email: 'orders@harbour.example', phone: '+91-22-4000-1002', leadTimeDays: 4 },
  { name: 'Deccan Foods', code: 'SUP-DECCAN', city: 'Hyderabad', email: 'orders@deccan.example', phone: '+91-40-4000-1003', leadTimeDays: 5 },
  { name: 'Garden City Supply', code: 'SUP-GARDEN', city: 'Bangalore', email: 'orders@gardencity.example', phone: '+91-80-4000-1004', leadTimeDays: 4 },
  { name: 'Hooghly Traders', code: 'SUP-HOOGHLY', city: 'Kolkata', email: 'orders@hooghly.example', phone: '+91-33-4000-1005', leadTimeDays: 6 },
  { name: 'Metro Cold Chain', code: 'SUP-METRO', city: 'Delhi', email: 'orders@metrocold.example', phone: '+91-11-4000-1006', leadTimeDays: 2 },
  { name: 'Western Ghats Agro', code: 'SUP-GHATS', city: 'Mumbai', email: 'orders@ghats.example', phone: '+91-22-4000-1007', leadTimeDays: 5 },
  { name: 'Coromandel Pack', code: 'SUP-COROMANDEL', city: 'Chennai', email: 'orders@coromandel.example', phone: '+91-44-4000-1008', leadTimeDays: 7 },
  { name: 'Malabar Commodities', code: 'SUP-MALABAR', city: 'Kochi', email: 'orders@malabar.example', phone: '+91-484-400-1009', leadTimeDays: 6 },
  { name: 'Indus Staples', code: 'SUP-INDUS', city: 'Ahmedabad', email: 'orders@indus.example', phone: '+91-79-4000-1010', leadTimeDays: 5 },
];

const COVER_DAYS: Record<string, number> = {
  'NB-MILK-500:DEL-01': 2,
  'NB-BREAD-400:BLR-01': 1,
  'NB-NOODLE-70:CCU-01': 3,
  'NB-COFFEE-180:BOM-01': 5,
  'NB-BHUJIA-150:DEL-01': 6,
  'NB-YOGURT-100:HYD-01': 4,
  'NB-OATS-40:BOM-01': 10,
  'NB-KETCHUP-500:BLR-01': 12,
  'NB-TEA-25:DEL-01': 9,
};

const CHANNELS = ['blinkit', 'zepto', 'instamart'] as const;

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function wipeDemo(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [{ slug: DEMO_SLUG }, { users: { some: { email: { in: DEMO_USERS.map((user) => user.email) } } } }],
    },
    select: { id: true },
  });

  for (const org of orgs) {
    const organizationId = org.id;
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { organizationId } });
      await tx.sale.deleteMany({ where: { organizationId } });
      await tx.purchaseOrderItem.deleteMany({ where: { organizationId } });
      await tx.purchaseOrder.deleteMany({ where: { organizationId } });
      await tx.forecast.deleteMany({ where: { organizationId } });
      await tx.replenishmentRecommendation.deleteMany({ where: { organizationId } });
      await tx.inventory.deleteMany({ where: { organizationId } });
      await tx.product.deleteMany({ where: { organizationId } });
      await tx.warehouse.deleteMany({ where: { organizationId } });
      await tx.supplier.deleteMany({ where: { organizationId } });
      await tx.user.deleteMany({ where: { organizationId } });
      await tx.organization.delete({ where: { id: organizationId } });
    });
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed Invorra');
  }

  await wipeDemo();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const rng = mulberry32(20260927);
  const today = startOfUtcDay(new Date());
  const historyStart = addUtcDays(today, -(HISTORY_DAYS - 1));

  const organization = await prisma.organization.create({
    data: { name: 'Nimbus Consumer Goods', slug: DEMO_SLUG },
  });

  const users = await Promise.all(
    DEMO_USERS.map((user) =>
      prisma.user.create({
        data: {
          organizationId: organization.id,
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
        },
      }),
    ),
  );
  const owner = users[0];
  if (!owner) {
    throw new Error('Owner user was not created');
  }

  const products = await Promise.all(
    PRODUCTS.map((product, index) =>
      prisma.product.create({
        data: {
          organizationId: organization.id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          brand: product.brand,
          unit: 'pcs',
          unitCost: product.unitCost,
          sellingPrice: product.sellingPrice,
          status: ProductStatus.ACTIVE,
          leadTimeDays: product.leadTimeDays,
          reorderPoint: Math.ceil(product.baseDaily * product.leadTimeDays),
          safetyStock: Math.ceil(product.baseDaily * 2),
          moq: [12, 24, 48, 144][index % 4] ?? 12,
        },
      }),
    ),
  );

  const warehouses = await Promise.all(
    WAREHOUSES.map((warehouse) =>
      prisma.warehouse.create({
        data: {
          organizationId: organization.id,
          name: warehouse.name,
          code: warehouse.code,
          city: warehouse.city,
          state: warehouse.state,
          address: warehouse.address,
        },
      }),
    ),
  );

  const suppliers = await Promise.all(
    SUPPLIERS.map((supplier) =>
      prisma.supplier.create({
        data: { organizationId: organization.id, ...supplier },
      }),
    ),
  );

  const recentUnits = new Map<string, number>();
  const dailyUnits = new Map<string, Map<string, number>>();
  const sales: Prisma.SaleCreateManyInput[] = [];

  for (let dayIndex = 0; dayIndex < HISTORY_DAYS; dayIndex += 1) {
    const soldAt = addUtcDays(historyStart, dayIndex);
    soldAt.setUTCHours(12, 0, 0, 0);
    const isWeekend = soldAt.getUTCDay() === 0 || soldAt.getUTCDay() === 6;
    const inLookback = dayIndex >= HISTORY_DAYS - LOOKBACK_DAYS;

    PRODUCTS.forEach((product, productIndex) => {
      WAREHOUSES.forEach((warehouse, warehouseIndex) => {
        let demand = product.baseDaily * warehouse.multiplier;
        demand *= isWeekend ? product.weekend : 1;
        demand *= 1 + (dayIndex / (HISTORY_DAYS - 1)) * 0.08;
        if (
          dayIndex >= 40 &&
          dayIndex <= 42 &&
          (product.category === 'Snacks' || product.category === 'Beverages')
        ) {
          demand *= 1.8;
        }
        demand *= 0.85 + rng() * 0.3;
        const quantity = Math.max(0, Math.round(demand));
        if (quantity === 0) {
          return;
        }

        const key = `${product.sku}:${warehouse.code}`;
        if (inLookback) {
          recentUnits.set(key, (recentUnits.get(key) ?? 0) + quantity);
        }
        const dayKey = soldAt.toISOString().slice(0, 10);
        const daily = dailyUnits.get(key) ?? new Map<string, number>();
        daily.set(dayKey, (daily.get(dayKey) ?? 0) + quantity);
        dailyUnits.set(key, daily);

        const productRow = products[productIndex];
        const warehouseRow = warehouses[warehouseIndex];
        if (!productRow || !warehouseRow) {
          return;
        }

        sales.push({
          organizationId: organization.id,
          productId: productRow.id,
          warehouseId: warehouseRow.id,
          recordedById: owner.id,
          quantity,
          unitPrice: product.sellingPrice,
          totalAmount: new Prisma.Decimal(product.sellingPrice).mul(quantity),
          channel: CHANNELS[(productIndex + warehouseIndex + dayIndex) % CHANNELS.length] ?? 'quick-commerce',
          soldAt,
        });
      });
    });
  }

  for (let offset = 0; offset < sales.length; offset += 1000) {
    await prisma.sale.createMany({ data: sales.slice(offset, offset + 1000) });
  }

  const inventoryRows: Prisma.InventoryCreateManyInput[] = [];
  const recommendationRows: Prisma.ReplenishmentRecommendationCreateManyInput[] = [];
  const forecastRows: Prisma.ForecastCreateManyInput[] = [];

  PRODUCTS.forEach((product, productIndex) => {
    WAREHOUSES.forEach((warehouse, warehouseIndex) => {
      const productRow = products[productIndex];
      const warehouseRow = warehouses[warehouseIndex];
      if (!productRow || !warehouseRow) {
        return;
      }
      const key = `${product.sku}:${warehouse.code}`;
      const averageDailyDemand = (recentUnits.get(key) ?? 0) / LOOKBACK_DAYS;
      const coverDays = COVER_DAYS[key] ?? 28;
      const quantity =
        averageDailyDemand > 0 ? Math.max(0, Math.round(averageDailyDemand * coverDays)) : coverDays * 2;
      const daysOfInventory = averageDailyDemand > 0 ? quantity / averageDailyDemand : null;
      const riskLevel =
        daysOfInventory === null
          ? 'LOW'
          : daysOfInventory <= 3
            ? 'CRITICAL'
            : daysOfInventory <= 7
              ? 'HIGH'
              : daysOfInventory <= 14
                ? 'MEDIUM'
                : 'LOW';

      inventoryRows.push({
        organizationId: organization.id,
        productId: productRow.id,
        warehouseId: warehouseRow.id,
        quantity,
        reservedQty: 0,
        reorderPoint: Math.ceil(averageDailyDemand * product.leadTimeDays),
      });

      const historyDates = calendarDatesEnding(today.toISOString().slice(0, 10), 30);
      const history = historyDates.map((date) => dailyUnits.get(key)?.get(date) ?? 0);
      const plan = buildPositionPlan({
        history,
        historyDates,
        currentStock: quantity,
        leadTimeDays: product.leadTimeDays,
        moq: productRow.moq,
        horizonDays: 14,
      });

      for (const day of plan.forecasts) {
        forecastRows.push({
          organizationId: organization.id,
          productId: productRow.id,
          warehouseId: warehouseRow.id,
          forecastDate: new Date(`${day.date}T00:00:00.000Z`),
          predictedDemand: day.predictedDemand.toFixed(2),
          lowerBound: day.lowerBound.toFixed(2),
          upperBound: day.upperBound.toFixed(2),
          confidence: plan.confidence.toFixed(4),
          modelVersion: 'weighted-ma-v1',
        });
      }

      if (plan.recommendedQty > 0 && riskLevel !== 'LOW') {
        recommendationRows.push({
          organizationId: organization.id,
          productId: productRow.id,
          warehouseId: warehouseRow.id,
          supplierId: suppliers[0]?.id ?? null,
          recommendedQty: plan.recommendedQty,
          currentStock: quantity,
          averageDailyDemand: averageDailyDemand.toFixed(4),
          daysOfInventory: daysOfInventory === null ? null : daysOfInventory.toFixed(2),
          forecastDemand: plan.horizonForecastDemand.toFixed(2),
          safetyStock: plan.safetyStock,
          leadTimeDays: product.leadTimeDays,
          moq: productRow.moq,
          stockoutProbability: plan.stockoutProbability.toFixed(4),
          rawOrderQuantity: plan.rawOrderQuantity,
          planningHorizonDays: 14,
          riskLevel,
          status: 'PENDING',
          expiresAt: addUtcDays(today, 7),
          rationale: plan.explanation,
        });
      }
    });
  });

  await prisma.inventory.createMany({ data: inventoryRows });
  if (forecastRows.length > 0) {
    for (let offset = 0; offset < forecastRows.length; offset += 1000) {
      await prisma.forecast.createMany({ data: forecastRows.slice(offset, offset + 1000) });
    }
  }
  if (recommendationRows.length > 0) {
    await prisma.replenishmentRecommendation.createMany({ data: recommendationRows });
  }

  const milk = products.find((product) => product.sku === 'NB-MILK-500');
  const delhi = warehouses.find((warehouse) => warehouse.code === 'DEL-01');
  const supplier = suppliers[0];
  if (milk && delhi && supplier) {
    const milkStock = inventoryRows.find(
      (row) => row.productId === milk.id && row.warehouseId === delhi.id,
    );
    const average = (recentUnits.get('NB-MILK-500:DEL-01') ?? 0) / LOOKBACK_DAYS;
    const orderQty = Math.max(1, Math.ceil(average * 21 - (milkStock?.quantity ?? 0)));
    await prisma.purchaseOrder.create({
      data: {
        organizationId: organization.id,
        supplierId: supplier.id,
        warehouseId: delhi.id,
        poNumber: 'PO-DEMO-MILK-DEL',
        status: 'PENDING_APPROVAL',
        createdById: owner.id,
        expectedAt: addUtcDays(today, supplier.leadTimeDays),
        notes: 'Demo replenishment for Delhi toned milk',
        items: {
          create: {
            organizationId: organization.id,
            productId: milk.id,
            quantity: orderQty,
            unitCost: milk.unitCost,
          },
        },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      userId: owner.id,
      action: 'SEED_COMPLETED',
      entityType: 'Organization',
      entityId: organization.id,
      metadata: {
        products: products.length,
        warehouses: warehouses.length,
        suppliers: suppliers.length,
        sales: sales.length,
        inventory: inventoryRows.length,
        forecasts: forecastRows.length,
        recommendations: recommendationRows.length,
      },
    },
  });

  console.log('Seeded Nimbus Consumer Goods');
  console.log(`Sales rows: ${sales.length}`);
  console.log(`Inventory positions: ${inventoryRows.length}`);
  console.log(`Recommendations: ${recommendationRows.length}`);
  console.log('Login with owner@nimbus.invorra / Password123!');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
