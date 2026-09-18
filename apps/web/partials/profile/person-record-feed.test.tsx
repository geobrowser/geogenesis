import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { PersonRecordFeed } from './person-record-feed';

vi.mock('~/core/hooks/use-space-labels', () => ({
  useSpaceLabels: () => ({ labelsById: new Map(), isLoading: false }),
  spaceLabel: () => undefined,
}));

vi.mock('~/core/profile/use-infinite-sentinel', () => ({
  useInfiniteSentinel: () => React.createRef<HTMLDivElement>(),
}));

vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item }: { item: { entityId: string } }) => <div data-testid="card">{item.entityId}</div>,
}));

const row = (entityId: string): ExploreFeedRow =>
  ({ entityId, spaceId: 'b7ebce52523244058f81f4aeb95a0b8e' }) as ExploreFeedRow;

function renderFeed(props: Partial<React.ComponentProps<typeof PersonRecordFeed>> = {}) {
  return render(
    <PersonRecordFeed
      rows={[]}
      isLoading={false}
      loadingLabel="Loading positions…"
      emptyLabel="No positions on claims yet."
      errorLabel="Couldn’t load positions."
      noun="positions"
      {...props}
    />
  );
}

/**
 * The three things an empty list can mean, kept apart (GEO-2859).
 *
 * Shared by Positions and Debates, so the distinction is made once rather than
 * in each tab — the Debates tab used to carry its own error branch and the
 * Positions tab had none, which is how a failed request came to print "No
 * positions on claims yet." about somebody with 190 of them.
 */
describe('PersonRecordFeed', () => {
  afterEach(cleanup);

  it('says it is loading while the first page is out', () => {
    renderFeed({ isLoading: true });

    expect(screen.getByText('Loading positions…')).toBeInTheDocument();
  });

  it('says there is nothing only when the request actually succeeded', () => {
    renderFeed();

    expect(screen.getByText('No positions on claims yet.')).toBeInTheDocument();
  });

  it('says it could not load when the request failed', () => {
    renderFeed({ isError: true });

    expect(screen.getByText('Couldn’t load positions.')).toBeInTheDocument();
    expect(screen.queryByText('No positions on claims yet.')).not.toBeInTheDocument();
  });

  // A failure on page four is not a reason to throw away pages one to three.
  it('keeps the rows it already has when a later page fails', () => {
    renderFeed({ rows: [row('claim-1'), row('claim-2')], isError: true });

    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.queryByText('Couldn’t load positions.')).not.toBeInTheDocument();
  });

  /**
   * ...but it does have to say so.
   *
   * The sentinel stops on `isError` — it must, or the 8000px margin turns one
   * failing page into a loop — so nothing will ask again on its own. Keeping the
   * rows without a word left a 208-claim record looking like a complete 20-claim
   * one, with nothing to press.
   */
  it('offers a retry when a later page failed', () => {
    const fetchNextPage = vi.fn();
    renderFeed({ rows: [row('claim-1')], isError: true, fetchNextPage });

    expect(screen.getByText('Couldn’t load more positions.')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Try again' }).click();

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a later page while one is still in flight', () => {
    renderFeed({ rows: [row('claim-1')], isError: true, isFetchingNextPage: true, fetchNextPage: () => {} });

    expect(screen.queryByText('Couldn’t load more positions.')).not.toBeInTheDocument();
  });

  it('offers no retry when nothing failed', () => {
    renderFeed({ rows: [row('claim-1')], fetchNextPage: () => {} });

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('prefers the loading line while a first page is still out, error or not', () => {
    renderFeed({ isLoading: true, isError: false });

    expect(screen.getByText('Loading positions…')).toBeInTheDocument();
  });
});
