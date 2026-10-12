import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DataTable, ErrorState, KpiCard, linkClass, LoadingState, PageHeader, panelClass, SectionHeading, StatusBadge } from '../components/ui';
import { daysLabel, money, percent, shortDate, units } from '../lib/format';
import { messageFor } from '../lib/errors';
import { dashboardApi, purchaseOrderApi, replenishmentApi } from '../services/api';
import type { DashboardSummary, HealthSummary, PurchaseOrder, Recommendation, RiskRow, SalesPoint } from '../types';

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [sales, setSales] = useState<SalesPoint[]>([]);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  function load(range = days) {
    setLoading(true);
    setError('');
    Promise.all([
      dashboardApi.summary(range),
      dashboardApi.sales(range),
      dashboardApi.inventoryHealth(),
      dashboardApi.stockoutRisks(),
      replenishmentApi.list({ limit: 5, status: 'PENDING' }),
      purchaseOrderApi.list({ limit: 5 }),
    ])
      .then(([summaryRes, salesRes, healthRes, riskRes, recRes, orderRes]) => {
        setSummary(summaryRes.data);
        setSales(salesRes.data);
        setHealth(healthRes.data);
        setRisks(riskRes.data);
        setRecommendations(recRes.data);
        setOrders(orderRes.data);
      })
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(days);
  }, [days]);

  if (loading) {
    return <LoadingState label="Building the operating picture" />;
  }
  if (error || !summary || !health) {
    return <ErrorState message={error || 'Dashboard data is unavailable.'} onRetry={() => load()} />;
  }

  const healthChart = [
    { name: 'Low', count: health.riskCounts.LOW, fill: '#166534' },
    { name: 'Medium', count: health.riskCounts.MEDIUM, fill: '#d97706' },
    { name: 'High', count: health.riskCounts.HIGH, fill: '#c2410c' },
    { name: 'Critical', count: health.riskCounts.CRITICAL, fill: '#b91c1c' },
  ];
  const axis = { fontSize: 11, fill: '#78716c' };

  return (
    <div>
      <PageHeader
        eyebrow="Operations"
        title="Command center"
        subtitle="Cover, stockout risk, and the orders waiting on a planner."
        action={
          <div className="inline-flex rounded-lg border border-line bg-white p-1 shadow-sm">
            {[1, 7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  days === value ? 'bg-ink text-white shadow-sm' : 'text-stone-600 hover:bg-mist'
                }`}
                onClick={() => setDays(value)}
              >
                {value === 1 ? 'Today' : `${value}d`}
              </button>
            ))}
          </div>
        }
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard tone="copper" label="Revenue" value={money(summary.revenue)} hint={`${units(summary.rangeSales?.units ?? summary.sales.last30Days.units)} units in view`} />
        <KpiCard tone="moss" label="Inventory value" value={money(summary.inventoryValue)} hint={`${summary.products} active products`} />
        <KpiCard tone="risk" label="Stockout risks" value={units(summary.stockoutCount)} hint={`${summary.criticalStockCount} critical`} />
        <KpiCard label="Pending POs" value={units(summary.pendingPurchaseOrders)} hint={`${summary.pendingRecommendations} recommendations waiting`} />
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-5">
        <article className={`${panelClass} p-5 xl:col-span-3`}>
          <h2 className="text-sm font-semibold tracking-tight">Sales trend</h2>
          <p className="mt-0.5 text-xs text-stone-500">Units sold across the selected window</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sales}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={axis} axisLine={false} tickLine={false} />
                <YAxis tick={axis} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="units" stroke="#b4532a" fill="#f6ddd0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className={`${panelClass} p-5 xl:col-span-2`}>
          <h2 className="text-sm font-semibold tracking-tight">Inventory health</h2>
          <p className="mt-0.5 text-xs text-stone-500">Positions by stockout risk</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthChart}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="name" tick={axis} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axis} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {healthChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      {summary.topProducts && summary.topProducts.length > 0 ? (
        <section className="mt-6 grid gap-4 xl:grid-cols-2">
          <div>
            <SectionHeading title="Top products" />
            <DataTable
              rows={summary.topProducts}
              rowKey={(row) => row.sku}
              columns={[
                { header: 'SKU', render: (row) => row.sku },
                { header: 'Units', render: (row) => units(row.units) },
                { header: 'Revenue', render: (row) => money(row.revenue) },
              ]}
            />
          </div>
          <div>
            <SectionHeading title="Warehouse performance" />
            <DataTable
              rows={summary.warehousePerformance ?? []}
              rowKey={(row) => row.name}
              columns={[
                { header: 'Warehouse', render: (row) => row.name },
                { header: 'City', render: (row) => row.city },
                { header: 'Revenue', render: (row) => money(row.revenue) },
              ]}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 xl:grid-cols-2">
        <div>
          <SectionHeading title="Stockout risk" action={<Link className={linkClass} to="/inventory">View inventory</Link>} />
          {risks.length === 0 ? (
            <p className={`${panelClass} px-4 py-8 text-sm text-stone-500`}>No high-risk positions right now.</p>
          ) : (
            <DataTable
              rows={risks.slice(0, 6)}
              rowKey={(row) => row.inventoryId}
              columns={[
                { header: 'SKU', render: (row) => row.sku },
                { header: 'City', render: (row) => row.city },
                { header: 'Cover', render: (row) => daysLabel(row.daysOfInventory) },
                { header: 'Probability', render: (row) => percent(row.stockoutProbability) },
                { header: 'Risk', render: (row) => <StatusBadge value={row.riskLevel} /> },
              ]}
            />
          )}
        </div>
        <div>
          <SectionHeading title="Replenishment" action={<Link className={linkClass} to="/replenishment">Open queue</Link>} />
          {recommendations.length === 0 ? (
            <p className={`${panelClass} px-4 py-8 text-sm text-stone-500`}>No pending recommendations.</p>
          ) : (
            <DataTable
              rows={recommendations}
              rowKey={(row) => row.id}
              onRow={(row) => {
                window.location.assign(`/replenishment/${row.id}`);
              }}
              columns={[
                { header: 'SKU', render: (row) => row.product?.sku ?? '—' },
                { header: 'Qty', render: (row) => units(row.recommendedQty) },
                { header: 'Risk', render: (row) => <StatusBadge value={row.riskLevel} /> },
              ]}
            />
          )}
        </div>
      </section>

      <section className="mt-6">
        <SectionHeading title="Recent purchase orders" action={<Link className={linkClass} to="/purchase-orders">All orders</Link>} />
        {orders.length === 0 ? (
          <p className={`${panelClass} px-4 py-8 text-sm text-stone-500`}>No purchase orders yet.</p>
        ) : (
          <DataTable
            rows={orders}
            rowKey={(row) => row.id}
            onRow={(row) => {
              window.location.assign(`/purchase-orders/${row.id}`);
            }}
            columns={[
              { header: 'PO', render: (row) => row.poNumber },
              { header: 'Supplier', render: (row) => row.supplier.name },
              { header: 'Total', render: (row) => money(row.totalAmount) },
              { header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { header: 'Created', render: (row) => shortDate(row.createdAt) },
            ]}
          />
        )}
      </section>
    </div>
  );
}

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <p className="font-medium text-stone-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink tabular">{payload[0]?.value ?? '—'}</p>
    </div>
  );
}
