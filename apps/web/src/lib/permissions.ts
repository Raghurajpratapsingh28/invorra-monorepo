import type { Role } from '../types';

const writeRoles: Role[] = ['OWNER', 'ADMIN'];

export function canManageCatalog(role: Role): boolean {
  return writeRoles.includes(role);
}

export function canOperate(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR';
}

export function canApprovePurchaseOrders(role: Role): boolean {
  return writeRoles.includes(role);
}

export function canSeeCatalog(role: Role): boolean {
  return role !== 'OPERATOR';
}

export function canReadAudit(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}
