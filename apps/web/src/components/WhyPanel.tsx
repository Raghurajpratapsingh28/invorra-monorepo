import { daysLabel, percent, units } from '../lib/format';
import type { Recommendation } from '../types';
import { panelClass } from './ui';

export function WhyPanel({ recommendation }: { recommendation: Recommendation }) {
  const facts = [
    ['Current stock', units(recommendation.currentStock)],
    ['Forecast', units(recommendation.forecastDemand)],
    ['Safety stock', units(recommendation.safetyStock)],
    ['Lead time', `${recommendation.leadTimeDays} days`],
    ['MOQ', units(recommendation.moq)],
    ['Recommended', units(recommendation.recommendedQty)],
  ];

  return (
    <section className={`${panelClass} p-6`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-copper">Why this recommendation?</p>
      <p className="mt-3 text-base leading-7 text-ink">{recommendation.rationale}</p>
      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-mist px-4 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 grid gap-3 text-sm md:grid-cols-4">
        <div className="rounded-lg border border-line px-3 py-3">Forecast {units(recommendation.forecastDemand)}</div>
        <div className="rounded-lg border border-line px-3 py-3">+ Safety {units(recommendation.safetyStock)}</div>
        <div className="rounded-lg border border-line px-3 py-3">− Stock {units(recommendation.currentStock)}</div>
        <div className="rounded-lg border border-line px-3 py-3">= Raw {units(recommendation.rawOrderQuantity)}</div>
      </div>
      <p className="mt-3 text-sm text-stone-600">
        Before MOQ rounding: {units(recommendation.rawOrderQuantity)}. Supplier MOQ: {units(recommendation.moq)}. Final:{' '}
        {units(recommendation.recommendedQty)}.
      </p>
      <p className="mt-4 text-sm text-stone-500">
        Stockout probability {percent(recommendation.stockoutProbability)} ·{' '}
        {daysLabel(recommendation.daysOfInventory)} of cover · raw quantity{' '}
        {units(recommendation.rawOrderQuantity)} before MOQ rounding.
      </p>
    </section>
  );
}
