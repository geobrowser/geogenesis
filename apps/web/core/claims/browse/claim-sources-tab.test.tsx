import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { Relation } from '~/core/types';

import { ClaimSourcesTab } from './claim-sources-tab';

const mocks = vi.hoisted(() => ({
  feed: null as Record<string, unknown> | null,
  refetch: vi.fn(),
  rows: [{ entityId: 'source-1', spaceId: 'space-1' }] as ExploreFeedRow[],
  isError: true,
  isFetching: false,
}));

vi.mock('./use-claim-explore-rows', () => ({
  useClaimExploreRows: () => ({
    data: mocks.rows,
    isLoading: false,
    isError: mocks.isError,
    isFetching: mocks.isFetching,
    refetch: mocks.refetch,
  }),
}));

vi.mock('./claim-provenance', () => ({ ClaimProvenance: () => <div data-testid="provenance" /> }));
vi.mock('~/partials/profile/person-record-feed', () => ({
  PersonRecordFeed: (props: Record<string, unknown>) => {
    mocks.feed = props;
    return <div data-testid="feed" />;
  },
}));

const sourceRelation = {
  id: 'source-relation',
  type: { id: SOURCES_PROPERTY_ID },
  toEntity: { id: 'source-1', name: 'Source' },
} as Relation;

describe('ClaimSourcesTab', () => {
  beforeEach(() => {
    mocks.feed = null;
    mocks.refetch.mockReset();
    mocks.rows = [{ entityId: 'source-1', spaceId: 'space-1' }] as ExploreFeedRow[];
    mocks.isError = true;
    mocks.isFetching = false;
  });

  afterEach(cleanup);

  it('exposes partial hydration failures through the shared feed retry', () => {
    render(<ClaimSourcesTab claimId="claim-1" claimRelations={[sourceRelation]} spaceId="space-1" />);

    expect(mocks.feed).toMatchObject({
      rows: mocks.rows,
      isError: true,
      isFetchingNextPage: false,
      fetchNextPage: mocks.refetch,
    });

    (mocks.feed?.fetchNextPage as () => void)();
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it('does not report a background retry as next-page loading', () => {
    mocks.isFetching = true;

    render(<ClaimSourcesTab claimId="claim-1" claimRelations={[sourceRelation]} spaceId="space-1" />);

    expect(mocks.feed).toMatchObject({ isFetchingNextPage: false });
  });
});
