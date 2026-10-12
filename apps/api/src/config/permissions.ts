import { UserRole } from '@prisma/client';

export const resources = [
  'products',
  'warehouses',
  'inventory',
  'suppliers',
  'sales',
  'forecasts',
  'replenishment',
  'purchase_orders',
  'analytics',
  'audit',
] as const;

export type Resource = (typeof resources)[number];
export type Action = 'read' | 'write' | 'delete' | 'approve';

const ALL: Action[] = ['read', 'write', 'delete', 'approve'];
const READ: Action[] = ['read'];
const READ_WRITE: Action[] = ['read', 'write'];
const NONE: Action[] = [];

export const PERMISSIONS: Record<UserRole, Record<Resource, readonly Action[]>> = {
  OWNER: {
    products: ALL,
    warehouses: ALL,
    inventory: ALL,
    suppliers: ALL,
    sales: ALL,
    forecasts: ALL,
    replenishment: ALL,
    purchase_orders: ALL,
    analytics: READ,
    audit: READ,
  },
  ADMIN: {
    products: ALL,
    warehouses: ALL,
    inventory: ALL,
    suppliers: ALL,
    sales: ALL,
    forecasts: ALL,
    replenishment: ALL,
    purchase_orders: ALL,
    analytics: READ,
    audit: READ,
  },
  OPERATOR: {
    products: NONE,
    warehouses: NONE,
    suppliers: NONE,
    inventory: READ_WRITE,
    sales: READ_WRITE,
    forecasts: READ_WRITE,
    replenishment: [...READ_WRITE, 'approve'],
    purchase_orders: READ_WRITE,
    analytics: READ,
    audit: NONE,
  },
  VIEWER: {
    products: READ,
    warehouses: READ,
    inventory: READ,
    suppliers: READ,
    sales: READ,
    forecasts: READ,
    replenishment: READ,
    purchase_orders: READ,
    analytics: READ,
    audit: NONE,
  },
};

export function can(role: UserRole, resource: Resource, action: Action): boolean {
  return PERMISSIONS[role][resource].includes(action);
}
