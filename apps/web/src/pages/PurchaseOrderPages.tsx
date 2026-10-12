import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  PrimaryButton,
  StatusBadge,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { messageFor } from '../lib/errors';
import { money, shortDate, units } from '../lib/format';
import { canApprovePurchaseOrders } from '../lib/permissions';
import { purchaseOrderApi } from '../services/api';
import type { Pagination as PageInfo, PurchaseOrder } from '../types';

const stages = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'] as const;

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(nextPage = 1) {
    setLoading(true);
    purchaseOrderApi
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

  return (
    <div>
      <PageHeader title="Purchase orders" subtitle="Approval creates a committed order. Only owners and admins can approve." />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="No purchase orders" body="Approve a replenishment recommendation to open the first order." />
      ) : null}
      {rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            onRow={(row) => navigate(`/purchase-orders/${row.id}`)}
            columns={[
              { header: 'PO number', render: (row) => row.poNumber },
              { header: 'Supplier', render: (row) => row.supplier.name },
              { header: 'Total', render: (row) => money(row.totalAmount) },
              { header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { header: 'Created', render: (row) => shortDate(row.createdAt) },
              { header: 'Actions', render: () => <span className="text-copper">Open</span> },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
    </div>
  );
}

export function PurchaseOrderDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [receipts, setReceipts] = useState<Record<string, string>>({});

  function load() {
    purchaseOrderApi
      .get(id)
      .then((response) => setOrder(response.data))
      .catch((caught: unknown) => setError(messageFor(caught)));
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) {
    return <ErrorState message={error} />;
  }
  if (!order) {
    return <LoadingState />;
  }

  const currentIndex = stages.indexOf(order.status as (typeof stages)[number]);
  const next =
    order.status === 'PENDING_APPROVAL'
      ? 'APPROVED'
      : order.status === 'APPROVED'
        ? 'SENT'
        : order.status === 'DRAFT'
          ? 'PENDING_APPROVAL'
          : null;
  const canMove = Boolean(user && (next !== 'APPROVED' || canApprovePurchaseOrders(user.role)));
  const canReceive = order.status === 'SENT' || order.status === 'PARTIALLY_RECEIVED';

  async function advance() {
    if (!next) {
      return;
    }
    setPending(true);
    try {
      const updated = await purchaseOrderApi.updateStatus(id, next);
      setOrder(updated);
      toast.push(`Status moved to ${next.replaceAll('_', ' ')}`);
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  async function receive(current: PurchaseOrder) {
    const items = current.items
      .map((item) => ({ purchaseOrderItemId: item.id, quantity: Number(receipts[item.id] || 0) }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      toast.push('Enter a quantity on at least one line', 'error');
      return;
    }
    setPending(true);
    try {
      const updated = await purchaseOrderApi.receive(id, items);
      setOrder(updated);
      setReceipts({});
      toast.push('Receipt posted to warehouse stock');
    } catch (caught) {
      toast.push(messageFor(caught), 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={order.poNumber}
        subtitle={`${order.supplier.name} · ${order.warehouse.name}, ${order.warehouse.city}`}
        action={
          next && canMove ? (
            <PrimaryButton type="button" disabled={pending} onClick={() => void advance()}>
              Mark {next.replaceAll('_', ' ').toLowerCase()}
            </PrimaryButton>
          ) : (
            <StatusBadge value={order.status} />
          )
        }
      />
      <ol className="mb-6 flex flex-wrap gap-2">
        {stages.map((stage, index) => (
          <li
            key={stage}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide ${
              order.status === 'CANCELLED'
                ? 'border-stone-200 bg-stone-100 text-stone-500'
                : index <= currentIndex
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-white text-stone-400'
            }`}
          >
            {stage.replaceAll('_', ' ')}
          </li>
        ))}
      </ol>
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-stone-500">Supplier</p>
          <p className="mt-2 font-semibold">{order.supplier.name}</p>
          <p className="text-sm text-stone-500">{order.supplier.code}</p>
        </article>
        <article className="rounded-xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-stone-500">Total</p>
          <p className="mt-2 text-2xl font-semibold">{money(order.totalAmount)}</p>
        </article>
        <article className="rounded-xl border border-line bg-white p-4 shadow-card">
          <p className="text-xs uppercase tracking-wide text-stone-500">Expected</p>
          <p className="mt-2 font-semibold">{shortDate(order.expectedAt)}</p>
          <p className="text-sm text-stone-500">Created {shortDate(order.createdAt)}</p>
        </article>
      </div>
      <DataTable
        rows={order.items}
        rowKey={(item) => item.id}
        columns={[
          { header: 'Product', render: (item) => item.productId },
          { header: 'Quantity', render: (item) => units(item.quantity) },
          { header: 'Received', render: (item) => units(item.receivedQty) },
          {
            header: 'Receive now',
            render: (item) =>
              canReceive && item.receivedQty < item.quantity ? (
                <input
                  className="w-24 rounded-lg border border-line px-2 py-1 text-sm"
                  inputMode="numeric"
                  placeholder={String(item.quantity - item.receivedQty)}
                  value={receipts[item.id] ?? ''}
                  onChange={(event) => setReceipts((current) => ({ ...current, [item.id]: event.target.value }))}
                />
              ) : (
                '—'
              ),
          },
          { header: 'Unit price', render: (item) => money(item.unitCost) },
          { header: 'Line total', render: (item) => money(item.lineTotal) },
        ]}
      />
      {canReceive ? (
        <div className="mt-4">
          <PrimaryButton type="button" disabled={pending} onClick={() => void receive(order)}>
            Post receipt
          </PrimaryButton>
        </div>
      ) : null}
      {order.notes ? <p className="mt-4 text-sm text-stone-500">{order.notes}</p> : null}
      {order.timeline && order.timeline.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Status history</h2>
          <ol className="mt-4 border-l border-line pl-5">
            {order.timeline.map((entry) => (
              <li key={entry.id} className="relative pb-4 text-sm last:pb-0">
                <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-copper" />
                <span className="font-semibold">{entry.action.replaceAll('_', ' ')}</span>
                <span className="text-stone-500"> · {entry.actor?.name ?? 'System'} · {shortDate(entry.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
