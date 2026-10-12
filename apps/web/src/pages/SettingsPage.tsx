import { PageHeader, panelClass } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { user } = useAuth();
  if (!user) {
    return null;
  }

  const account = [
    ['Name', user.name],
    ['Email', user.email],
    ['Role', user.role],
    ['Organization', user.organization.name],
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        subtitle="How this organization turns sales history into an order a person can approve."
      />
      <section className={`${panelClass} p-6`}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Account</h2>
        <dl className="mt-4 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {account.map(([label, value]) => (
            <div key={label} className="bg-white px-4 py-3">
              <dt className="text-xs text-stone-500">{label}</dt>
              <dd className="mt-1 font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={`${panelClass} mt-4 space-y-3 p-6 text-sm leading-6 text-stone-600`}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Methodology</h2>
        <p>
          With the forecast service connected, each series uses gbm-demand-v2: two gradient boosting
          models (raw demand and log demand), lags through 21 days, weekday and month cycles, and a flag
          when a day is zero after recent sales. Later horizon days are pulled back toward last week.
          If the service is offline, the fallback is 0.5 × 7-day average + 0.3 × 14-day average + 0.2 ×
          30-day average, times a weekday index. Confidence is coverage plus holdout accuracy. It is not a random score.
        </p>
        <p>
          Stockout probability is the chance that normally distributed lead-time demand exceeds available
          stock. Mean demand is the sum of daily forecasts over the supplier lead time. Spread is the daily
          standard deviation times the square root of lead time. If cover is shorter than lead time, risk
          is at least high.
        </p>
        <p>
          Safety stock = 1.65 × daily standard deviation × √lead time, about a 95% service level. Recommended
          quantity is the 14-day forecast plus safety stock, minus current stock, rounded up to the product MOQ.
        </p>
      </section>
    </div>
  );
}
