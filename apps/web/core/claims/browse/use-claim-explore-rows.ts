'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import {
  claimExploreRowPages,
  claimExploreRowsQueryKey,
  fetchClaimExploreRowsPage,
} from './claim-explore-rows';

export { CLAIM_RECORD_PAGE_SIZE, claimExploreRowPages } from './claim-explore-rows';

type ClaimExploreRowsQueryResult = {
  data?: ExploreFeedRow[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

function combineClaimExploreRows(queries: ClaimExploreRowsQueryResult[]) {
  return {
    data: queries.flatMap(query => query.data ?? []),
    isLoading: queries.some(query => query.isLoading),
    isError: queries.some(query => query.isError),
    isFetching: queries.some(query => query.isFetching),
    refetch: async () => void (await Promise.all(queries.filter(query => query.isError).map(query => query.refetch()))),
  };
}

/**
 * Hydrates a claim-scoped id list through the shared Explore card projection.
 *
 * Related claims, their debates, and source entities all use the same display space and card
 * model. Stable request-page keys preserve already loaded pages during infinite scroll without
 * ever asking `fetchExploreRowsByIds` to materialize an unbounded id list.
 */
export function useClaimExploreRows(ids: string[], spaceId: string, enabled = true) {
  const pages = React.useMemo(() => claimExploreRowPages(ids), [ids]);

  return useQueries({
    queries: pages.map(page => {
      return {
        queryKey: claimExploreRowsQueryKey(spaceId, page),
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchClaimExploreRowsPage(page, spaceId, signal),
        enabled,
        staleTime: 30_000,
      };
    }),
    combine: combineClaimExploreRows,
  });
}
