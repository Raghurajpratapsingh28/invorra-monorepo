export type Role = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER';

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organization: { id: string; name: string; slug: string };
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  unitCost: string;
  sellingPrice: string;
  status: 'ACTIVE' | 'INACTIVE';
  leadTimeDays: number;
  moq: number;
  safetyStock: number;
};

export type InventoryRow = {
  id: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  product: { id: string; sku: string; name: string; unitCost: string; sellingPrice: string };
  warehouse: { id: string; code: string; name: string; city: string };
};

export type RiskRow = {
  inventoryId: string;
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  city: string;
  quantity: number;
  availableQty: number;
  averageDailyDemand: number;
  daysOfInventory: number | null;
  forecastDemand: number;
  horizonForecastDemand: number;
  stockoutProbability: number;
  safetyStock: number;
  leadTimeDays: number;
  moq: number;
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export type Sale = {
  id: string;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  channel: string;
  soldAt: string;
  productId: string;
  warehouseId: string;
};

export type Supplier = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  leadTimeDays: number;
};

export type Forecast = {
  id: string;
  forecastDate: string;
  predictedDemand: string;
  lowerBound: string | null;
  upperBound: string | null;
  confidence: string;
  modelVersion: string;
  product?: { id: string; sku: string; name: string };
  warehouse?: { name: string; city: string; code: string };
};

export type ForecastModel = {
  name?: string;
  algorithm?: string;
  features?: string[];
  active?: boolean;
  limitations?: string[];
  unavailable?: boolean;
};

export type Recommendation = {
  id: string;
  recommendedQty: number;
  currentStock: number;
  forecastDemand: string;
  safetyStock: number;
  leadTimeDays: number;
  moq: number;
  stockoutProbability: string;
  rawOrderQuantity: number;
  planningHorizonDays: number;
  averageDailyDemand: string;
  daysOfInventory: string | null;
  riskLevel: RiskRow['riskLevel'];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  rationale: string | null;
  product?: { id: string; sku: string; name: string; unitCost?: string };
  warehouse?: { id: string; name: string; city: string; code: string };
  supplier?: { id: string; name: string; code: string; leadTimeDays: number } | null;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  status:
    | 'DRAFT'
    | 'PENDING_APPROVAL'
    | 'APPROVED'
    | 'SENT'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CANCELLED';
  totalAmount: string;
  notes: string | null;
  orderedAt: string | null;
  expectedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string; code: string };
  warehouse: { id: string; name: string; city: string; code: string };
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    receivedQty: number;
    unitCost: string;
    lineTotal: string;
  }>;
  timeline?: Array<{
    id: string;
    action: string;
    at: string;
    actor: { name: string; email: string } | null;
  }>;
};

export type DashboardSummary = {
  revenue: string;
  inventoryValue: string;
  stockoutCount: number;
  criticalStockCount: number;
  pendingRecommendations: number;
  pendingPurchaseOrders: number;
  rangeDays?: number;
  rangeSales?: { orders: number; units: number; revenue: string };
  topProducts?: Array<{ sku: string; name: string; units: number; revenue: string }>;
  warehousePerformance?: Array<{ name: string; city: string; units: number; revenue: string }>;
  products: number;
  warehouses: number;
  sales: {
    last7Days: { orders: number; units: number; revenue: string };
    last30Days: { orders: number; units: number; revenue: string };
  };
};

export type SalesPoint = { date: string; units: number; revenue: string };

export type HealthSummary = {
  riskCounts: Record<RiskRow['riskLevel'], number>;
  byWarehouse: Array<{
    warehouseName: string;
    city: string;
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  }>;
};
