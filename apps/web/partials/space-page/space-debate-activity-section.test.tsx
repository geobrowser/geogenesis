import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { SpaceDebateActivitySection } from './space-debate-activity-section';

const mocks = vi.hoisted(() => ({
  eligibility: { isEligible: true, isLoading: false },
  rows: { debates: [] as ExploreFeedRow[], claims: [] as ExploreFeedRow[] },
  rowState: { isLoading: false, isError: false },
  counts: { debates: 0 as number | null, claims: 0 as number | null },
  countsState: { isLoading: false, isError: false },
}));

vi.mock('~/core/space/use-space-debate-activity', () => ({
  useSpaceDebateEligibility: () => mocks.eligibility,
  useSpaceActivityRows: (_spaceId: string, kind: 'debates' | 'claims') => ({
    rows: mocks.rows[kind],
    ...mocks.rowState,
  }),
  useSpaceDebateActivityCounts: () => ({ counts: mocks.counts, ...mocks.countsState }),
}));

/**
 * The card itself is tested in `profile-activity-section.test.tsx`; what matters here is the
 * `kinds` this surface hands it. Rendering its props is the only way to assert on the two things
 * this component actually decides — whether to ask at all, and what each kind says.
 */
vi.mock('~/partials/profile/profile-activity-section', () => ({
  ProfileActivitySection: ({ kinds, className }: { kinds: any[]; className?: string }) => (
    <div data-testid="activity-card" data-class={className}>
      {kinds.map(kind => (
        <div
          key={kind.key}
          data-testid={`kind-${kind.key}`}
          data-total={String(kind.total)}
          data-count-unavailable={String(Boolean(kind.isCountUnavailable))}
          data-loading={String(Boolean(kind.isLoading))}
          data-error={String(Boolean(kind.isError))}
          data-href={kind.href}
          data-skip-anchor={String(Boolean(kind.skipTabsAnchor))}
          data-rows={kind.rows.length}
        >
          {kind.seeAllLabel}
        </div>
      ))}
    </div>
  ),
}));

const row = (entityId: string) => ({ entityId, spaceId: 'space-1', types: [] }) as unknown as ExploreFeedRow;

beforeEach(() => {
  mocks.eligibility = { isEligible: true, isLoading: false };
  mocks.rows = { debates: [row('d1')], claims: [row('c1')] };
  mocks.rowState = { isLoading: false, isError: false };
  mocks.counts = { debates: 12, claims: 34 };
  mocks.countsState = { isLoading: false, isError: false };
});

afterEach(cleanup);

describe('SpaceDebateActivitySection', () => {
  it('offers both kinds with their totals and see-all routes', () => {
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    const debates = screen.getByTestId('kind-debates');
    expect(debates).toHaveAttribute('data-total', '12');
    expect(debates).toHaveAttribute('data-href', '/space/space-1/debates');
    expect(debates).toHaveTextContent('See all debates');

    const claims = screen.getByTestId('kind-claims');
    expect(claims).toHaveAttribute('data-total', '34');
    expect(claims).toHaveAttribute('data-href', '/space/space-1/claims');
    expect(claims).toHaveTextContent('See all claims');
  });

  // Most spaces are not set up for debates, and three requests per Overview to render nothing is
  // the cost this gate exists to avoid.
  it('renders nothing on a space the debate acceptor does not edit', () => {
    mocks.eligibility = { isEligible: false, isLoading: false };
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.queryByTestId('activity-card')).not.toBeInTheDocument();
  });

  // A skeleton here would promise an Activity section on every space on the site, including the
  // overwhelming majority that will never show one.
  it('renders nothing while eligibility is still unknown', () => {
    mocks.eligibility = { isEligible: true, isLoading: true };
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.queryByTestId('activity-card')).not.toBeInTheDocument();
  });

  // "0 debates" over six visible debates reads as a bug in the page. A failed count is a dash.
  it('marks a count that could not be read as unavailable rather than zero', () => {
    mocks.counts = { debates: null, claims: 34 };
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.getByTestId('kind-debates')).toHaveAttribute('data-count-unavailable', 'true');
    expect(screen.getByTestId('kind-claims')).toHaveAttribute('data-count-unavailable', 'false');
  });

  // While the count is still out it is not yet unavailable — that would flash a dash and then a
  // number — and the rows must not paint under a confident 0 either.
  it('holds the kind loading while the count is in flight', () => {
    mocks.counts = { debates: null, claims: null };
    mocks.countsState = { isLoading: true, isError: false };
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    const debates = screen.getByTestId('kind-debates');
    expect(debates).toHaveAttribute('data-loading', 'true');
    expect(debates).toHaveAttribute('data-count-unavailable', 'false');
  });

  // The rows and the counts are separate requests; a failed row read is the kind's own error and
  // must not take the other kind — or the card — down with it.
  it('passes a failed row read through as that kind alone erroring', () => {
    mocks.rowState = { isLoading: false, isError: true };
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.getByTestId('kind-debates')).toHaveAttribute('data-error', 'true');
    expect(screen.getByTestId('activity-card')).toBeInTheDocument();
  });

  // The debates index is full-bleed, so `#space-tabs` has nothing to land on there and would only
  // ride along in a copied URL. The claims route has tabs and keeps it.
  it('drops the tab-bar fragment for debates and keeps it for claims', () => {
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.getByTestId('kind-debates')).toHaveAttribute('data-skip-anchor', 'true');
    expect(screen.getByTestId('kind-claims')).toHaveAttribute('data-skip-anchor', 'false');
  });

  // The card decides whether it renders at all, so the gap under it has to travel with it.
  it('hands the card its own bottom spacing', () => {
    render(<SpaceDebateActivitySection spaceId="space-1" />);

    expect(screen.getByTestId('activity-card')).toHaveAttribute('data-class', 'mb-10');
  });
});
