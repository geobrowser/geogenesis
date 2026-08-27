import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PayoutItem } from '~/core/bounties/group-submissions';

import { BountyPayoutsTable } from './bounty-payouts-table';

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: React.ComponentPropsWithoutRef<'a'>) => <a href={href}>{children}</a>,
}));

afterEach(cleanup);

function payout(overrides: Partial<PayoutItem> & { id: string }): PayoutItem {
  return {
    payoutEntityId: `pe-${overrides.id}`,
    recipientEntityId: 'aaaa0000000000000000000000000001',
    recipientName: 'Alice',
    recipientIsSpace: true,
    amount: 100,
    proposalIds: ['p1'],
    createdAt: new Date('2026-08-20T00:00:00Z'),
    ...overrides,
  };
}

describe('BountyPayoutsTable', () => {
  it('links a personal-space recipient to the space page and a legacy person entity to its entity page', () => {
    render(
      <BountyPayoutsTable
        spaceId="dao"
        payouts={[
          payout({ id: 'a' }),
          payout({
            id: 'b',
            recipientEntityId: 'bbbb0000000000000000000000000002',
            recipientName: 'Bob',
            recipientIsSpace: false,
          }),
        ]}
      />
    );
    expect(screen.getByText('Alice')).toHaveAttribute('href', '/space/aaaa0000000000000000000000000001');
    expect(screen.getByText('Bob')).toHaveAttribute('href', '/space/dao/bbbb0000000000000000000000000002');
    expect(screen.getByText('200 points paid across 2 payouts')).toBeInTheDocument();
  });

  it('pages at ten rows while the summary counts every payout', () => {
    render(
      <BountyPayoutsTable
        spaceId="dao"
        payouts={Array.from({ length: 12 }, (_, i) => payout({ id: `p${i}`, recipientName: `Curator ${i}` }))}
      />
    );
    expect(screen.getAllByTestId('payout-row')).toHaveLength(10);
    expect(screen.getByText('1,200 points paid across 12 payouts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByTestId('payout-row')).toHaveLength(2);
    expect(screen.getByText('Curator 11')).toBeInTheDocument();
  });
});
