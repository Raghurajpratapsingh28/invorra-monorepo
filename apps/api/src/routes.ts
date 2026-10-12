import { Router } from 'express';
import { assistantRouter } from './modules/assistant/assistant.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { authRouter } from './modules/auth/auth.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { forecastRouter } from './modules/forecasts/forecasts.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { productRouter } from './modules/products/products.routes';
import { purchaseOrderRouter } from './modules/purchase-orders/purchase-orders.routes';
import { replenishmentRouter } from './modules/replenishment/replenishment.routes';
import { salesRouter } from './modules/sales/sales.routes';
import { supplierRouter } from './modules/suppliers/suppliers.routes';
import { warehouseRouter } from './modules/warehouses/warehouses.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/warehouses', warehouseRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/suppliers', supplierRouter);
apiRouter.use('/forecasts', forecastRouter);
apiRouter.use('/replenishment', replenishmentRouter);
apiRouter.use('/purchase-orders', purchaseOrderRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/audit', auditRouter);
apiRouter.use('/audit-logs', auditRouter);
apiRouter.use('/assistant', assistantRouter);
