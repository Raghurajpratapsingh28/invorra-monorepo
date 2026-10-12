import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SecondaryButton,
  StatusBadge,
  controlClass,
  panelClass,
} from '../components/ui';
import { daysLabel, percent, units } from '../lib/format';
import { messageFor } from '../lib/errors';
import { assistantApi, inventoryApi } from '../services/api';
import type { InventoryRow, Pagination as PageInfo, RiskRow } from '../types';

export function InventoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [search, setSearch] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(nextPage = pageNumber) {
    setLoading(true);
    inventoryApi
      .risks({
        page: nextPage,
        limit: 20,
        ...(search ? { search } : {}),
        ...(riskLevel ? { riskLevel } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      })
      .then((response) => {
        setRows(response.data);
        setPage(response.pagination ?? null);
        setError('');
        if (!warehouseId) {
          const unique = new Map<string, string>();
          response.data.forEach((row) => unique.set(row.warehouseId, `${row.warehouseName}`));
          setWarehouses([...unique.entries()].map(([id, name]) => ({ id, name })));
        }
      })
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(1);
    setPageNumber(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskLevel, warehouseId]);

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Cover, daily demand, and stockout probability for every product and warehouse."
      />
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPageNumber(1);
          load(1);
        }}
      >
        <input className={`${controlClass} w-full sm:w-64`} placeholder="Search SKU, product, city" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className={`${controlClass} w-full sm:w-40`} value={riskLevel} onChange={(event) => setRiskLevel(event.target.value)}>
          <option value="">All risk</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
        <select className={`${controlClass} w-full sm:w-56`} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
          <option value="">All warehouses</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
          ))}
        </select>
        <SecondaryButton type="submit">Search</SecondaryButton>
      </form>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load(pageNumber)} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No positions match" body="Try another warehouse, risk level, or search term." />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.inventoryId}
            onRow={(row) => navigate(`/inventory/${row.inventoryId}`)}
            columns={[
              { header: 'SKU', render: (row) => <span className="font-semibold">{row.sku}</span> },
              { header: 'Product', render: (row) => row.productName },
              { header: 'Warehouse', render: (row) => `${row.warehouseName}` },
              { header: 'Current stock', render: (row) => units(row.quantity) },
              { header: 'Daily demand', render: (row) => row.averageDailyDemand.toFixed(1) },
              { header: 'Days remaining', render: (row) => daysLabel(row.daysOfInventory) },
              { header: 'Risk', render: (row) => <StatusBadge value={row.riskLevel} /> },
              { header: 'Actions', render: () => <span className="text-copper">Details</span> },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={(next) => { setPageNumber(next); load(next); }} />
        </>
      ) : null}
    </div>
  );
}

export function InventoryDetailPage() {
  const { id = '' } = useParams();
  const [row, setRow] = useState<InventoryRow | null>(null);
  const [risk, setRisk] = useState<RiskRow | null>(null);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState('');

  useEffect(() => {
    inventoryApi
      .get(id)
      .then(async (response) => {
        setRow(response.data);
        const risks = await inventoryApi.risks({
          productId: response.data.product.id,
          warehouseId: response.data.warehouse.id,
          limit: 5,
        });
        setRisk(risks.data[0] ?? null);
      })
      .catch((caught: unknown) => setError(messageFor(caught)));
  }, [id]);

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!row) {
    return <LoadingState />;
  }

  return (
    <div>
      <PageHeader eyebrow="Inventory" title={row.product.name} subtitle={`${row.product.sku} · ${row.warehouse.name}, ${row.warehouse.city}`} />
      <div className="grid gap-4 md:grid-cols-3">
        <article className={`${panelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">On hand</p>
          <p className="mt-2 text-3xl font-semibold tabular">{units(row.quantity)}</p>
          <p className="mt-2 text-sm text-stone-500">{units(row.reservedQty)} reserved</p>
        </article>
        <article className={`${panelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Daily demand</p>
          <p className="mt-2 text-3xl font-semibold tabular">{risk ? risk.averageDailyDemand.toFixed(2) : '—'}</p>
          <p className="mt-2 text-sm text-stone-500">{daysLabel(risk?.daysOfInventory)} of cover</p>
        </article>
        <article className={`${panelClass} p-5`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Stockout probability</p>
          <p className="mt-2 text-3xl font-semibold tabular">{risk ? percent(risk.stockoutProbability) : '—'}</p>
          <div className="mt-2">{risk ? <StatusBadge value={risk.riskLevel} /> : null}</div>
        </article>
      </div>
      <div className="mt-6">
        <SecondaryButton
          type="button"
          onClick={() => {
            void assistantApi.explain('inventory', id).then((result) => setExplanation(result.explanation)).catch((caught: unknown) => setError(messageFor(caught)));
          }}
        >
          Why is this SKU at risk?
        </SecondaryButton>
        {explanation ? <p className="mt-4 max-w-3xl text-sm leading-7 text-ink">{explanation}</p> : null}
      </div>
      {risk ? (
        <p className="mt-6 max-w-3xl text-sm leading-6 text-stone-600">
          Lead-time forecast is {units(risk.forecastDemand)} units over {risk.leadTimeDays} days.
          Planning-horizon forecast is {units(risk.horizonForecastDemand)} units. Safety stock is{' '}
          {units(risk.safetyStock)} at MOQ {units(risk.moq)}. Probability is the chance lead-time demand
          exceeds available stock, using a normal distribution around that forecast.
        </p>
      ) : null}
    </div>
  );
}
