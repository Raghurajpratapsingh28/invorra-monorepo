import { prisma } from './prisma';

/** Deletes a tenant in FK-safe order. Used by seed and tests. */
export async function deleteTenant(organizationId: string): Promise<void> {
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
