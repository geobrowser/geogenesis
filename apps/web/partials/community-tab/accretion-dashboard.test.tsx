import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { AccretionDashboardResult } from '~/core/community/accretion-types';

import { AccretionDashboard } from './accretion-dashboard';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const result: AccretionDashboardResult = {
  period: 'year',
  asOf: '2026-08-29T00:00:00.000Z',
  methodologyVersion: 'curator-program-v1',
  summary: {
    bountiesPosted: 4,
    acceptedProposals: 3,
    payoutAmount: 500,
    modeledPayoutAmount: 200,
    acceptedArtifacts: 8,
    weightedOutputUnits: 8,
    replacementValue: 240,
    retroactiveRoi: 1.2,
  },
  unitCosts: [
    {
      typeId: 'claim-type',
      typeName: 'Claim',
      rawUnits: 8,
      weightedUnits: 8,
      proposalSamples: 3,
      medianUnitCost: 30,
      modeledSpend: 200,
    },
  ],
  timeline: [{ key: '2026-08', label: "Aug '26", bountiesPosted: 4, bountiesDelivered: 3, payoutAmount: 500 }],
  curatorCohorts: [
    {
      curatorId: 'curator-1',
      name: 'Ada',
      payoutAmount: 200,
      outputUnits: 8,
      replacementValue: 240,
      efficiency: 1.2,
      inferred: true,
    },
  ],
  delivery: [
    { key: 'posted', label: 'Published', count: 4 },
    { key: 'allocated', label: 'Allocated', count: 4 },
    { key: 'submitted', label: 'Submitted', count: 3 },
    { key: 'accepted', label: 'Accepted', count: 3 },
    { key: 'paid', label: 'Paid', count: 2 },
    { key: 'on-time', label: 'On time', count: 2 },
  ],
  duplication: { native: 6, reused: 2, unknown: 0, unclassifiedProposals: 0 },
  coverage: {
    bounties: 4,
    bountiesWithBudget: 4,
    bountiesWithStatus: 4,
    bountiesWithDeadline: 3,
    payouts: 2,
    payoutsWithAmount: 2,
    payoutsWithRecipient: 0,
    acceptedProposals: 3,
    classifiedProposals: 3,
    diffProposalLimit: 24,
    diffLimitReached: false,
    sourceTruncated: false,
  },
  warnings: ['Payout amounts are nominal.'],
};

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccretionDashboard spaceId="space-1" initialData={result} />
    </QueryClientProvider>
  );
}

describe('AccretionDashboard', () => {
  it('renders all six pre-launch panels and the compensation boundary', () => {
    renderDashboard();

    expect(screen.getAllByText('Unit cost deck').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Retroactive ROI').length).toBeGreaterThan(0);
    expect(screen.getByText('Absorption curve')).toBeTruthy();
    expect(screen.getByText('Spend-to-output by curator')).toBeTruthy();
    expect(screen.getByText('Declared versus delivered')).toBeTruthy();
    expect(screen.getByText('Duplication check')).toBeTruthy();
    expect(screen.getByText(/Payment remains a separate, human-adjudicated clearing decision/)).toBeTruthy();
  });

  it('shows methodology, coverage, and provisional attribution', () => {
    renderDashboard();

    expect(screen.getAllByText(/curator-program-v1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Direct recipients').length).toBeGreaterThan(0);
    expect(screen.getAllByText('inferred').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payout amounts are nominal.').length).toBeGreaterThan(0);
  });
});
