import { useEffect, useState } from 'react';
import { DataTable, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { messageFor } from '../lib/errors';
import { shortDate } from '../lib/format';
import { auditApi } from '../services/api';
import type { Pagination as PageInfo } from '../types';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { name: string; email: string } | null;
};

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function load(nextPage = 1) {
    setLoading(true);
    auditApi
      .list({ page: nextPage, limit: 25, ...(action ? { action } : {}) })
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
  }, [action]);

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who changed inventory, forecasts, recommendations, and purchase orders." />
      <select className="mb-4 rounded-lg border border-line bg-white px-3 py-2 text-sm" value={action} onChange={(event) => setAction(event.target.value)}>
        <option value="">All actions</option>
        {['USER_LOGIN', 'SALE_RECORDED', 'FORECAST_GENERATED', 'RECOMMENDATION_CREATED', 'RECOMMENDATION_APPROVED', 'PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER_APPROVED', 'PURCHASE_ORDER_STATUS_CHANGED'].map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No audit events" body="Actions in this organization will appear here." /> : null}
      {rows.length > 0 ? (
        <>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { header: 'When', render: (row) => shortDate(row.createdAt) },
              { header: 'Who', render: (row) => row.user?.name ?? 'System' },
              { header: 'Action', render: (row) => <StatusBadge value={row.action} /> },
              { header: 'Entity', render: (row) => row.entityType },
              { header: 'IP', render: (row) => row.ipAddress ?? '—' },
            ]}
          />
          <Pagination page={page?.page ?? 1} totalPages={page?.totalPages ?? 1} onPage={load} />
        </>
      ) : null}
    </div>
  );
}
