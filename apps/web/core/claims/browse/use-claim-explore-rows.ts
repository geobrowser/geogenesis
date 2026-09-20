'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { normId } from '~/core/utils/norm-id';

export const CLAIM_RECORD_PAGE_SIZE = 20;

/** Stable request-sized chunks, preserving the complete Best-ranked id order. */
export function claimExploreRowPages(ids: readonly string[]): string[][] {
  const pages: string[][] = [];
  for (let start = 0; start < ids.length; start += CLAIM_RECORD_PAGE_SIZE) {
    pages.push(ids.slice(start, start + CLAIM_RECORD_PAGE_SIZE));
  }
  return pages;
}

/**
 * Hydrates a claim-scoped id list through the shared Explore card projection.
 *
 * Related claims, their debates, and source entities all use the same display space and card
 * model. Stable request-page keys preserve already loaded pages during infinite scroll without
 * ever asking `fetchExploreRowsByIds` to materialize an unbounded id list.
 */
export function useClaimExploreRows(ids: string[], spaceId: string, enabled = true) {
  const normalizedSpaceId = normId(spaceId);
  const pages = React.useMemo(() => claimExploreRowPages(ids), [ids]);

  const queries = useQueries({
    queries: pages.map(page => {
      const normalizedIds = page.map(normId);

      return {
        queryKey: ['claim', 'explore-rows', normalizedSpaceId, normalizedIds],
        queryFn: ({ signal }: { signal: AbortSignal }) => {
          const preferredSpaces = new Map(normalizedIds.map(id => [id, [spaceId]]));
          return fetchExploreRowsByIds(page, signal, preferredSpaces);
        },
        enabled,
        staleTime: 30_000,
      };
    }),
  });

  const data = queries.flatMap(query => query.data ?? []);
  const refetch = React.useCallback(
    async () => void (await Promise.all(queries.filter(query => query.isError).map(query => query.refetch()))),
    [queries]
  );

  return {
    data,
    isLoading: queries.some(query => query.isLoading),
    isError: queries.some(query => query.isError),
    isFetching: queries.some(query => query.isFetching),
    refetch,
  };
}
