import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, ProtectedRoute } from './components/Shell';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { ForecastsPage, ProductsPage, SalesPage, SuppliersPage } from './pages/CatalogPages';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryDetailPage, InventoryPage } from './pages/InventoryPages';
import { PurchaseOrderDetailPage, PurchaseOrdersPage } from './pages/PurchaseOrderPages';
import { ReplenishmentDetailPage, ReplenishmentPage } from './pages/ReplenishmentPages';
import { SettingsPage } from './pages/SettingsPage';
import { AssistantPage } from './pages/AssistantPage';
import { AuditPage } from './pages/AuditPage';
import { GuidePage } from './pages/GuidePage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/inventory/:id" element={<InventoryDetailPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/forecasts" element={<ForecastsPage />} />
          <Route path="/replenishment" element={<ReplenishmentPage />} />
          <Route path="/replenishment/:id" element={<ReplenishmentDetailPage />} />
          <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/guide" element={<GuidePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
