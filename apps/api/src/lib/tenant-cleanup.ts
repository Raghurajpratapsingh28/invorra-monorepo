import { cols, removeMany, withTransaction } from '../db/mongo';

/** Deletes every document owned by a tenant. Used by seed and tests. */
export async function deleteTenant(organizationId: string): Promise<void> {
  await withTransaction(async () => {
    await removeMany(cols.auditLogs, { organizationId });
    await removeMany(cols.sales, { organizationId });
    await removeMany(cols.purchaseOrders, { organizationId });
    await removeMany(cols.forecasts, { organizationId });
    await removeMany(cols.recommendations, { organizationId });
    await removeMany(cols.inventory, { organizationId });
    await removeMany(cols.products, { organizationId });
    await removeMany(cols.warehouses, { organizationId });
    await removeMany(cols.suppliers, { organizationId });
    await removeMany(cols.users, { organizationId });
    await removeMany(cols.organizations, { _id: organizationId });
  });
}
