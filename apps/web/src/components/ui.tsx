import { useEffect, type ReactNode } from 'react';

export const panelClass = 'rounded-xl border border-line bg-white shadow-card';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className={`${panelClass} flex items-center gap-3 px-5 py-14 text-sm text-stone-500`} role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-copper" />
      {label}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-mist px-6 py-14 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-sm font-semibold text-copper shadow-sm">
        —
      </span>
      <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">{body}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800" role="alert">
      <p className="font-medium">Something needs attention</p>
      <p className="mt-1 leading-6">{message}</p>
      {onRetry ? (
        <button type="button" className="mt-3 font-semibold underline decoration-red-300 underline-offset-2" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

const kpiTone: Record<string, string> = {
  ink: 'bg-ink',
  moss: 'bg-moss',
  copper: 'bg-copper',
  risk: 'bg-red-600',
};

export function KpiCard({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof kpiTone;
}) {
  return (
    <article className={`relative overflow-hidden ${panelClass} px-5 py-4`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${kpiTone[tone]}`} aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-[1.7rem] font-semibold leading-none tracking-tight text-ink tabular">{value}</p>
      {hint ? <p className="mt-2 text-sm text-stone-500">{hint}</p> : null}
    </article>
  );
}

const tones: Record<string, string> = {
  LOW: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  MEDIUM: 'border-amber-200 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-200 bg-orange-50 text-orange-800',
  CRITICAL: 'border-red-200 bg-red-50 text-red-800',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-900',
  PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-900',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-stone-200 bg-stone-100 text-stone-600',
  EXPIRED: 'border-stone-200 bg-stone-100 text-stone-500',
  DRAFT: 'border-stone-200 bg-stone-100 text-stone-700',
  SENT: 'border-sky-200 bg-sky-50 text-sky-800',
  PARTIALLY_RECEIVED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  RECEIVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CANCELLED: 'border-stone-200 bg-stone-100 text-stone-500',
  ACTIVE: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  INACTIVE: 'border-stone-200 bg-stone-100 text-stone-500',
};

const dots: Record<string, string> = {
  LOW: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
  PENDING: 'bg-amber-500',
  PENDING_APPROVAL: 'bg-amber-500',
  APPROVED: 'bg-emerald-500',
  REJECTED: 'bg-stone-400',
  EXPIRED: 'bg-stone-400',
  DRAFT: 'bg-stone-400',
  SENT: 'bg-sky-500',
  PARTIALLY_RECEIVED: 'bg-indigo-500',
  RECEIVED: 'bg-emerald-500',
  CANCELLED: 'bg-stone-400',
  ACTIVE: 'bg-emerald-500',
  INACTIVE: 'bg-stone-400',
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${tones[value] ?? 'border-stone-200 bg-stone-100 text-stone-700'}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dots[value] ?? 'bg-stone-400'}`} aria-hidden />
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
      <span className="tabular">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg border border-line bg-white px-3 py-1.5 font-medium text-ink shadow-sm transition hover:bg-mist disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-lg border border-line bg-white px-3 py-1.5 font-medium text-ink shadow-sm transition hover:bg-mist disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm font-medium text-stone-500 transition hover:bg-mist hover:text-ink"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRow,
}: {
  columns: Array<{ header: string; render: (row: T) => ReactNode; className?: string }>;
  rows: T[];
  rowKey: (row: T) => string;
  onRow?: (row: T) => void;
}) {
  return (
    <div className={`overflow-hidden ${panelClass}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-mist text-[11px] uppercase tracking-[0.12em] text-stone-500">
            <tr>
              {columns.map((column) => (
                <th key={column.header} className={`px-4 py-3 font-semibold ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-t border-line/80 transition ${onRow ? 'cursor-pointer hover:bg-mist' : ''}`}
                onClick={onRow ? () => onRow(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.header} className={`px-4 py-3 align-middle tabular ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-copper">{eyebrow}</p>
        ) : null}
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-6 text-stone-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

export const linkClass = 'text-sm font-semibold text-copper transition hover:text-ink';

const buttonBase =
  'inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50';

export function PrimaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`${buttonBase} bg-ink text-white hover:bg-[#24362d] ${className}`}>
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${buttonBase} border border-line bg-white text-ink hover:bg-mist ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[13px] font-medium text-stone-600">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  'rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none transition placeholder:text-stone-400 focus:border-copper focus:ring-2 focus:ring-copper/15';

export const inputClass = `w-full ${controlClass}`;
