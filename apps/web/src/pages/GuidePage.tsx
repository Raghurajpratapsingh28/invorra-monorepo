import { Link } from 'react-router-dom';
import { linkClass, PageHeader, panelClass } from '../components/ui';

const steps = [
  {
    title: '1. Load the network',
    body: 'Products, warehouses, and suppliers are the master data. SKU, warehouse code, and supplier code must match the files your sales team already uses. Lead time and MOQ live on the product; the supplier lead time sets the expected receipt date on a purchase order.',
    to: '/products',
    action: 'Open products',
  },
  {
    title: '2. Bring in sell-out',
    body: 'Forecasts are only as good as daily sales. Export from the quick-commerce portal as CSV with columns sku, warehouse, quantity, soldAt. warehouse is the warehouse code. Optional columns: channel, unitPrice. Each row decrements on-hand stock, so do not import the same file twice.',
    to: '/sales',
    action: 'Import sales',
  },
  {
    title: '3. Train the demand model',
    body: 'Open Forecasts and train. With the Python service running, each product-warehouse series is fit with gbm-demand-v2: a level model and a log-demand model, weekday and month cycles, and a flag for zero days after recent sales. Short histories fall back to last-week repeat. If the service is down, the weighted moving average is stored instead.',
    to: '/forecasts',
    action: 'Train forecasts',
  },
  {
    title: '4. Read risk before you order',
    body: 'Inventory shows days of cover and the chance that lead-time demand exceeds available stock (on-hand minus reserved). Critical means cover is already inside the supplier lead time. The order quantity is separate: 14-day forecast plus safety stock, minus available stock, rounded up to case pack.',
    to: '/inventory',
    action: 'Review inventory',
  },
  {
    title: '5. Generate, then approve',
    body: 'Generate recommendations, open a line, and read the equation before you approve. Approval creates a purchase order in pending approval. An owner or admin marks it approved, then sent. Nothing ships until a person moves it.',
    to: '/replenishment',
    action: 'Open replenishment',
  },
  {
    title: '6. Receive into the warehouse',
    body: 'When the truck arrives, open the purchase order, enter the quantity actually received on each line, and post the receipt. Stock increases by that amount. A short receipt stays partially received so the next delivery can be booked against the same order.',
    to: '/purchase-orders',
    action: 'Open purchase orders',
  },
];

export function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Operating guide"
        title="How a planner runs Invorra"
        subtitle="This desk is for a brand selling through city warehouses. The model proposes a quantity. A person approves it. The assistant explains the numbers and will not create purchase orders until you confirm."
      />
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className={`${panelClass} flex gap-4 p-5`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">
              {index + 1}
            </span>
            <div>
              <h2 className="text-base font-semibold tracking-tight">{step.title.replace(/^\d+\.\s/, '')}</h2>
              <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
              <Link className={`mt-3 inline-block ${linkClass}`} to={step.to}>
                {step.action}
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-6 rounded-xl border border-ink bg-ink px-5 py-5 text-stone-200 shadow-card">
        <h2 className="text-sm font-semibold text-white">What the model will not do</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
          <li>It does not train across other brands. Each SKU and warehouse is its own series.</li>
          <li>It does not see price or promotions. A campaign week will look like a demand spike.</li>
          <li>A zero-sales day is flagged, not rewritten as lost sales. If the shelf was empty, the forecast can be low.</li>
          <li>Ask the assistant “what should I order today?” It reads pending recommendations. It never invents a quantity.</li>
        </ul>
      </section>
    </div>
  );
}
