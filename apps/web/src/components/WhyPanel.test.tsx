import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Recommendation } from '../types';
import { StatusBadge } from './ui';
import { WhyPanel } from './WhyPanel';

const recommendation: Recommendation = {
  id: 'rec',
  recommendedQty: 1728,
  currentStock: 340,
  forecastDemand: '1820.00',
  safetyStock: 200,
  leadTimeDays: 3,
  moq: 144,
  stockoutProbability: '0.72',
  rawOrderQuantity: 1680,
  planningHorizonDays: 14,
  averageDailyDemand: '130.0000',
  daysOfInventory: '2.60',
  riskLevel: 'CRITICAL',
  status: 'PENDING',
  rationale:
    'Recommended 1,728 units because forecast demand for the planning horizon is 1,820 units, current inventory is 340 units, safety stock requirement is 200 units, and the order quantity was rounded to the supplier MOQ of 144 units.',
};

describe('business components', () => {
  it('shows the recommendation math', () => {
    render(<WhyPanel recommendation={recommendation} />);
    expect(screen.getByText(/why this recommendation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1,728/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('340').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1,820').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200').length).toBeGreaterThan(0);
    expect(screen.getAllByText('144').length).toBeGreaterThan(0);
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
  });

  it('labels purchase-order status without raw underscores', () => {
    render(<StatusBadge value="PENDING_APPROVAL" />);
    expect(screen.getByText('PENDING APPROVAL')).toBeInTheDocument();
  });
});
