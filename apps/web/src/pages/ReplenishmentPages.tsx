import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WhyPanel } from '../components/WhyPanel';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { messageFor } from '../lib/errors';
import { percent, units } from '../lib/format';
import { canOperate } from '../lib/permissions';
import { replenishmentApi } from '../services/api';
import type { Pagination as PageInfo, Recommendation } from '../types';

export function ReplenishmentPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Recommendation[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  function load(nextPage = 1) {
    setLoading(true);
    replenishmentApi
      .list({ page: nextPage, limit: 20, ...(status ? { status } : {}) })
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
  }, [status]);

  async function generate() {
    setPending(true);
    try {
      const result = await replenishmentApi.generate();
      toast.push(`Created ${result.created} recommendations`);
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
        title="Replenishment"
        subtitle="Order quantity is horizon forecast plus safety stock, minus on-hand stock, rounded up to MOQ."
        action={
          user && canOperate(user.role) ? (
            <PrimaryButton type="button" disabled={pending} onClick={() => void generate()}>
              {pending ? 'Calculating…' : 'Generate'}
            </PrimaryButton>
          ) : null
        }
      />
      <select className="mb-4 rounded-lg border border-line bg-white px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">All statuses</option>
        {['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="Nothing to replenish" body="Generate recommendations from current stock and the forecast." />
      ) : null}
      {rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            onRow={(row) => navigate(`/replenishment/${row.id}`)}
            columns={[
              { header: 'SKU', render: (row) => row.product?.sku ?? '—' },
              { header: 'Warehouse', render: (row) => row.warehouse?.city ?? '—' },
              { header: 'Current stock', render: (row) => units(row.currentStock) },
              { header: 'Forecast', render: (row) => units(row.forecastDemand) },
              { header: 'Safety stock', render: (row) => units(row.safetyStock) },
              { header: 'Recommended', render: (row) => units(row.recommendedQty) },
              { header: 'Stockout', render: (row) => percent(row.stockoutProbability) },
              { header: 'Risk', render: (row) => <StatusBadge value={row.riskLevel} /> },
              { header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { header: 'Action', render: () => <span className="text-copper">Review</span> },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
    </div>
  );
}

export function ReplenishmentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [row, setRow] = useState<Recommendation | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    replenishmentApi
      .get(id)
      .then((response) => setRow(response.data))
      .catch((caught: unknown) => setError(messageFor(caught)));
  }, [id]);

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!row) {
    return <LoadingState />;
  }

  const canDecide = Boolean(user && canOperate(user.role) && row.status === 'PENDING');

  async function approve() {
    setPending(true);
    try {
      const result = await replenishmentApi.approve(id, row?.supplier?.id);
      toast.push(`Purchase order ${result.poNumber} created`);
      navigate(`/purchase-orders/${result.purchaseOrderId}`);
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    setPending(true);
    try {
      await replenishmentApi.reject(id, 'Rejected by planner');
      toast.push('Recommendation rejected');
      const fresh = await replenishmentApi.get(id);
      setRow(fresh.data);
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.product?.name ?? 'Recommendation'}
        subtitle={`${row.product?.sku ?? ''} · ${row.warehouse?.name ?? ''} ${row.warehouse?.city ?? ''}`}
        action={
          canDecide ? (
            <div className="flex gap-2">
              <SecondaryButton type="button" disabled={pending} onClick={() => void reject()}>Reject</SecondaryButton>
              <PrimaryButton type="button" disabled={pending} onClick={() => void approve()}>Approve</PrimaryButton>
            </div>
          ) : (
            <StatusBadge value={row.status} />
          )
        }
      />
      <WhyPanel recommendation={row} />
      <p className="text-sm text-stone-500">
        Supplier {row.supplier ? `${row.supplier.name} (${row.supplier.code})` : 'not assigned'}. Approving creates a
        purchase order in pending approval.
      </p>
    </div>
  );
}
