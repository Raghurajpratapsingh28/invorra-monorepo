import type {
  ProductStatus,
  PurchaseOrderStatus,
  RecommendationStatus,
  RiskLevel,
  UserRole,
} from './enums';

export type OrganizationDoc = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserDoc = {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductDoc = {
  id: string;
  organizationId: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  unitCost: string;
  sellingPrice: string;
  status: ProductStatus;
  leadTimeDays: number;
  reorderPoint: number;
  safetyStock: number;
  moq: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WarehouseDoc = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  city: string;
  state: string | null;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SupplierDoc = {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  leadTimeDays: number;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryDoc = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  reservedQty: number;
  reorderPoint: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SaleDoc = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  recordedById: string | null;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  channel: string;
  soldAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type ForecastDoc = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  forecastDate: Date;
  predictedDemand: string;
  lowerBound: string | null;
  upperBound: string | null;
  confidence: string;
  modelVersion: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RecommendationDoc = {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  supplierId: string | null;
  recommendedQty: number;
  currentStock: number;
  averageDailyDemand: string;
  daysOfInventory: string | null;
  forecastDemand: string;
  safetyStock: number;
  leadTimeDays: number;
  moq: number;
  stockoutProbability: string;
  rawOrderQuantity: number;
  planningHorizonDays: number;
  riskLevel: RiskLevel;
  status: RecommendationStatus;
  rationale: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseOrderItemDoc = {
  id: string;
  organizationId: string;
  productId: string;
  quantity: number;
  unitCost: string;
  receivedQty: number;
};

export type PurchaseOrderDoc = {
  id: string;
  organizationId: string;
  supplierId: string;
  warehouseId: string;
  recommendationId: string | null;
  poNumber: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  orderedAt: Date | null;
  expectedAt: Date | null;
  createdById: string | null;
  approvedById: string | null;
  items: PurchaseOrderItemDoc[];
  createdAt: Date;
  updatedAt: Date;
};

export type AuditLogDoc = {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
};
