import axios from 'axios';
import { toApiError } from '../lib/errors';
import type {
  DashboardSummary,
  Forecast,
  ForecastModel,
  HealthSummary,
  InventoryRow,
  Pagination,
  Product,
  PurchaseOrder,
  Recommendation,
  RiskRow,
  Sale,
  SalesPoint,
  Supplier,
  User,
} from '../types';

export const http = axios.create({
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error);
    if (apiError.status === 401 && axios.isAxiosError(error)) {
      const url = error.config?.url ?? '';
      if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
        window.dispatchEvent(new Event('invorra:unauthorized'));
      }
    }
    return Promise.reject(apiError);
  },
);

type Envelope<T> = { success: true; data: T; pagination?: Pagination };

async function get<T>(url: string, params?: object): Promise<Envelope<T>> {
  const response = await http.get<Envelope<T>>(url, { params });
  return response.data;
}

async function send<T>(method: 'post' | 'patch' | 'delete', url: string, body?: unknown) {
  const response = await http.request<Envelope<T>>({ method, url, data: body });
  return response.data.data;
}

export const authApi = {
  async register(input: { organizationName: string; name: string; email: string; password: string }) {
    return send<{ user: User }>('post', '/api/auth/register', input);
  },
  async login(input: { email: string; password: string }) {
    return send<{ user: User }>('post', '/api/auth/login', input);
  },
  async logout() {
    return send<{ loggedOut: boolean }>('post', '/api/auth/logout');
  },
  async me() {
    const response = await get<{ user: User }>('/api/auth/me');
    return response.data.user;
  },
};

export const productApi = {
  list: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    get<Product[]>('/api/products', params),
  create: (body: {
    sku: string;
    name: string;
    unitCost: string;
    sellingPrice: string;
    category?: string;
    leadTimeDays?: number;
    moq?: number;
  }) => send<Product>('post', '/api/products', body),
};

export const inventoryApi = {
  get: (id: string) => get<InventoryRow>(`/api/inventory/${id}`),
  risks: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    warehouseId?: string;
    riskLevel?: string;
    productId?: string;
  }) => get<RiskRow[]>('/api/inventory/risks', params),
};

export const salesApi = {
  list: (params?: { page?: number; limit?: number }) => get<Sale[]>('/api/sales', params),
  importCsv: (csv: string) =>
    send<{ created: number; failed: number; errors: Array<{ line: number; message: string }> }>(
      'post',
      '/api/sales/import',
      { csv },
    ),
};

export const supplierApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    get<Supplier[]>('/api/suppliers', params),
  create: (body: { name: string; code: string; city?: string; leadTimeDays?: number; email?: string }) =>
    send<Supplier>('post', '/api/suppliers', body),
};

export const forecastApi = {
  list: (params?: { page?: number; limit?: number; productId?: string; warehouseId?: string }) =>
    get<Forecast[]>('/api/forecasts', params),
  model: () => get<ForecastModel>('/api/forecasts/model'),
  generate: () =>
    send<{
      created: number;
      modelVersion: string;
      horizonDays: number;
      metrics?: { medianMape: number | null; series: number };
    }>('post', '/api/forecasts/generate', {}),
};

export const replenishmentApi = {
  list: (params?: { page?: number; limit?: number; status?: string; riskLevel?: string }) =>
    get<Recommendation[]>('/api/replenishment', params),
  get: (id: string) => get<Recommendation>(`/api/replenishment/${id}`),
  generate: () => send<{ created: number }>('post', '/api/replenishment/generate', {}),
  approve: (id: string, supplierId?: string) =>
    send<{ purchaseOrderId: string; poNumber: string; purchaseOrderStatus: string }>(
      'post',
      `/api/replenishment/${id}/approve`,
      supplierId ? { supplierId } : {},
    ),
  reject: (id: string, reason?: string) =>
    send<{ id: string; status: string }>('post', `/api/replenishment/${id}/reject`, reason ? { reason } : {}),
};

export const purchaseOrderApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) =>
    get<PurchaseOrder[]>('/api/purchase-orders', params),
  get: (id: string) => get<PurchaseOrder>(`/api/purchase-orders/${id}`),
  updateStatus: (id: string, status: PurchaseOrder['status']) =>
    send<PurchaseOrder>('patch', `/api/purchase-orders/${id}/status`, { status }),
  receive: (id: string, items: Array<{ purchaseOrderItemId: string; quantity: number }>) =>
    send<PurchaseOrder>('post', `/api/purchase-orders/${id}/receive`, { items }),
};

export const assistantApi = {
  chat: (message: string) =>
    send<{
      reply: string;
      toolsUsed: string[];
      confirmation: { id: string; action: string; count: number } | null;
    }>('post', '/api/assistant/chat', { message }),
  confirm: (confirmationId: string, confirm: boolean) =>
    send<{ executed: boolean; reply: string }>('post', '/api/assistant/confirm', { confirmationId, confirm }),
  explain: (target: 'recommendation' | 'inventory', id: string) =>
    send<{ facts: Record<string, unknown>; explanation: string; source: string }>('post', '/api/assistant/explain', {
      target,
      id,
    }),
};

export const auditApi = {
  list: (params?: { page?: number; limit?: number; action?: string; entityType?: string }) =>
    get<
      Array<{
        id: string;
        action: string;
        entityType: string;
        entityId: string | null;
        ipAddress: string | null;
        createdAt: string;
        user: { name: string; email: string } | null;
      }>
    >('/api/audit-logs', params),
};

export const dashboardApi = {
  summary: (days = 30) => get<DashboardSummary>('/api/dashboard/summary', { days }),
  sales: (days = 30) => get<SalesPoint[]>('/api/dashboard/sales', { days }),
  inventoryHealth: () => get<HealthSummary>('/api/dashboard/inventory-health'),
  stockoutRisks: () => get<RiskRow[]>('/api/dashboard/stockout-risks'),
};
