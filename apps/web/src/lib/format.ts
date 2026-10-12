export function money(value: string | number | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function units(value: string | number | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount);
}

export function percent(value: string | number | null | undefined): string {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return `${(amount * 100).toFixed(1)}%`;
}

export function daysLabel(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return 'No demand';
  }
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return `${amount.toFixed(1)}d`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
