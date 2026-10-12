import { useEffect, useState, type FormEvent } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  Pagination,
  PrimaryButton,
  StatusBadge,
  inputClass,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { messageFor } from '../lib/errors';
import { money, shortDate, units } from '../lib/format';
import { canManageCatalog, canOperate } from '../lib/permissions';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { forecastApi, productApi, salesApi, supplierApi } from '../services/api';
import type { Forecast, ForecastModel, Pagination as PageInfo, Product, Sale, Supplier } from '../types';

export function ProductsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(nextPage = 1) {
    setLoading(true);
    productApi
      .list({ page: nextPage, limit: 20, ...(search ? { search } : {}) })
      .then((response) => {
        setRows(response.data);
        setPage(response.pagination ?? null);
        setError('');
      })
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await productApi.create({
        sku: String(form.get('sku')),
        name: String(form.get('name')),
        unitCost: String(form.get('unitCost')),
        sellingPrice: String(form.get('sellingPrice')),
        category: String(form.get('category') || ''),
        moq: Number(form.get('moq') || 1),
        leadTimeDays: Number(form.get('leadTimeDays') || 5),
      });
      toast.push('Product created');
      setOpen(false);
      load();
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="SKUs are unique inside your organization."
        action={
          user && canManageCatalog(user.role) ? (
            <PrimaryButton type="button" onClick={() => setOpen(true)}>Add product</PrimaryButton>
          ) : null
        }
      />
      <form className="mb-4" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input className={`${inputClass} max-w-sm`} placeholder="Search name or SKU" value={search} onChange={(event) => setSearch(event.target.value)} />
      </form>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No products" body="Add the first SKU for this organization." /> : null}
      {!loading && rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'SKU', render: (row) => row.sku },
              { header: 'Name', render: (row) => row.name },
              { header: 'Category', render: (row) => row.category ?? '—' },
              { header: 'Cost', render: (row) => money(row.unitCost) },
              { header: 'Price', render: (row) => money(row.sellingPrice) },
              { header: 'MOQ', render: (row) => units(row.moq) },
              { header: 'Lead time', render: (row) => `${row.leadTimeDays}d` },
              { header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
      {open ? (
        <Modal title="New product" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={(event) => void create(event)}>
            <Field label="SKU"><input className={inputClass} name="sku" required /></Field>
            <Field label="Name"><input className={inputClass} name="name" required /></Field>
            <Field label="Category"><input className={inputClass} name="category" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit cost"><input className={inputClass} name="unitCost" required placeholder="10.00" /></Field>
              <Field label="Selling price"><input className={inputClass} name="sellingPrice" required placeholder="16.00" /></Field>
              <Field label="MOQ"><input className={inputClass} name="moq" type="number" min={1} defaultValue={1} /></Field>
              <Field label="Lead time days"><input className={inputClass} name="leadTimeDays" type="number" min={0} defaultValue={5} /></Field>
            </div>
            <PrimaryButton type="submit">Save product</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

const SALES_TEMPLATE = 'sku,warehouse,quantity,soldAt,channel,unitPrice\n';

export function SalesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Sale[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  function load(nextPage = 1) {
    setLoading(true);
    salesApi
      .list({ page: nextPage, limit: 20 })
      .then((response) => {
        setRows(response.data);
        setPage(response.pagination ?? null);
      })
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function onImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get('file');
    if (!(file instanceof File) || file.size === 0) {
      toast.push('Choose a CSV file first', 'error');
      return;
    }
    setImporting(true);
    try {
      const result = await salesApi.importCsv(await file.text());
      toast.push(`Imported ${result.created} sales${result.failed ? `, ${result.failed} skipped` : ''}`);
      load();
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="Each sale decrements on-hand inventory in the same transaction. Import a CSV when the channel file lands."
        action={
          user && canOperate(user.role) ? (
            <a className="text-sm font-semibold text-copper" href={`data:text/csv,${encodeURIComponent(SALES_TEMPLATE)}`} download="invorra-sales-template.csv">
              Download template
            </a>
          ) : null
        }
      />
      {user && canOperate(user.role) ? (
        <form className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4" onSubmit={(event) => void onImport(event)}>
          <Field label="CSV import">
            <input className={inputClass} name="file" type="file" accept=".csv,text/csv" />
          </Field>
          <PrimaryButton type="submit" disabled={importing}>{importing ? 'Importing…' : 'Import sales'}</PrimaryButton>
        </form>
      ) : null}
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No sales yet" body="Recorded quick-commerce sales will show up here." /> : null}
      {rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'When', render: (row) => shortDate(row.soldAt) },
              { header: 'Channel', render: (row) => row.channel },
              { header: 'Quantity', render: (row) => units(row.quantity) },
              { header: 'Unit price', render: (row) => money(row.unitPrice) },
              { header: 'Total', render: (row) => money(row.totalAmount) },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
    </div>
  );
}

export function SuppliersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  function load() {
    setLoading(true);
    supplierApi
      .list({ limit: 50 })
      .then((response) => setRows(response.data))
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await supplierApi.create({
        name: String(form.get('name')),
        code: String(form.get('code')),
        city: String(form.get('city') || ''),
        leadTimeDays: Number(form.get('leadTimeDays') || 5),
      });
      toast.push('Supplier added');
      setOpen(false);
      load();
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="The fastest supplier is preselected when recommendations are generated."
        action={user && canManageCatalog(user.role) ? <PrimaryButton type="button" onClick={() => setOpen(true)}>Add supplier</PrimaryButton> : null}
      />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No suppliers" body="Add a supplier before approving replenishment." /> : null}
      {rows.length > 0 ? (
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            { header: 'Code', render: (row) => row.code },
            { header: 'Name', render: (row) => row.name },
            { header: 'City', render: (row) => row.city ?? '—' },
            { header: 'Lead time', render: (row) => `${row.leadTimeDays} days` },
            { header: 'Email', render: (row) => row.email ?? '—' },
          ]}
        />
      ) : null}
      {open ? (
        <Modal title="New supplier" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={(event) => void create(event)}>
            <Field label="Name"><input className={inputClass} name="name" required /></Field>
            <Field label="Code"><input className={inputClass} name="code" required /></Field>
            <Field label="City"><input className={inputClass} name="city" /></Field>
            <Field label="Lead time days"><input className={inputClass} name="leadTimeDays" type="number" min={0} defaultValue={5} /></Field>
            <PrimaryButton type="submit">Save supplier</PrimaryButton>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

export function ForecastsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Forecast[]>([]);
  const [chart, setChart] = useState<Forecast[]>([]);
  const [model, setModel] = useState<ForecastModel | null>(null);
  const [run, setRun] = useState<{ modelVersion: string; medianMape: number | null } | null>(null);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  function load(nextPage = 1) {
    setLoading(true);
    forecastApi
      .list({ page: nextPage, limit: 20 })
      .then((response) => {
        setRows(response.data);
        setPage(response.pagination ?? null);
        const productId = response.data[0]?.product?.id;
        if (!productId) {
          setChart([]);
          return;
        }
        return forecastApi.list({ productId, limit: 20 }).then((series) => setChart(series.data));
      })
      .catch((caught: unknown) => setError(messageFor(caught)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    forecastApi
      .model()
      .then((response) => setModel(response.data))
      .catch(() => setModel(null));
  }, []);

  async function generate() {
    setPending(true);
    try {
      const result = await forecastApi.generate();
      setRun({ modelVersion: result.modelVersion, medianMape: result.metrics?.medianMape ?? null });
      toast.push(`Wrote ${units(result.created)} ${result.modelVersion} forecast rows`);
      load();
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Forecasts"
        subtitle="Each series is scored on a 7-day holdout, then a gradient boosting model projects the next 14 days. Replenishment uses those stored predictions."
        action={user && canOperate(user.role) ? <PrimaryButton type="button" disabled={pending} onClick={() => void generate()}>{pending ? 'Training…' : 'Train forecasts'}</PrimaryButton> : null}
      />
      <section className="mb-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-xl border border-line bg-white p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Model</p>
          <h2 className="mt-2 text-lg font-semibold">{model?.name ?? 'Forecast model'}</h2>
          <p className="mt-1 text-sm text-stone-500">{model?.algorithm ?? 'Baseline until the forecast service is reached'}</p>
          {model?.features ? <p className="mt-3 text-sm leading-6 text-stone-600">{model.features.join(' · ')}</p> : null}
          {run ? (
            <p className="mt-3 text-sm">
              Last run {run.modelVersion}
              {run.medianMape !== null ? ` · median holdout MAPE ${(run.medianMape * 100).toFixed(1)}%` : ''}
            </p>
          ) : null}
        </article>
        <article className="h-56 rounded-xl border border-line bg-white p-4 shadow-card">
          {chart.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart.map((row) => ({ date: row.forecastDate.slice(5, 10), demand: Number(row.predictedDemand) }))}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#78716c' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip />
                <Area type="monotone" dataKey="demand" stroke="#166534" fill="#d7ebe1" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-stone-500">Train a forecast to plot the next 14 days for one SKU.</p>
          )}
        </article>
      </section>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No forecasts stored" body="Train the model on the last 30 days of sales." /> : null}
      {rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'Date', render: (row) => shortDate(row.forecastDate) },
              { header: 'SKU', render: (row) => row.product?.sku ?? '—' },
              { header: 'Warehouse', render: (row) => row.warehouse?.city ?? '—' },
              { header: 'Demand', render: (row) => units(row.predictedDemand) },
              { header: 'Confidence', render: (row) => `${Math.round(Number(row.confidence) * 100)}%` },
              { header: 'Model', render: (row) => row.modelVersion },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
    </div>
  );
}
