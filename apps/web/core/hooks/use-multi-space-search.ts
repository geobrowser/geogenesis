'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';

import { dedupeSearchResultTypeTags } from '~/core/utils/search-result-types';

import { capSearchQuery } from '../io/search-query';
import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';
import type { SearchResult } from '../types';
import { isSearchCancellation } from './search-cancellation';
import { useDebouncedValue } from './use-debounced-value';
import { searchResultMatchesAllowedTypes } from './use-search';

const DEFAULT_PAGE_SIZE = 10;

const MAX_ROWS_PER_SPACE = 100;

type SpacePage = { results: SearchResult[]; total: number; succeeded: boolean };

/**
 * Multi-space restrict for the global search, done as a small fan-out: the REST endpoint has no
 * "restrict to this set of spaces" parameter (only `scope=SPACE_SINGLE` for one), so each selected
 * space is searched on its own `SPACE_SINGLE` query (`where.space`, the same path `useSearch`'s
 * `filterBySpace` takes) and the per-space, per-relevance results are interleaved and de-duped.
 *
 * One space is the plain `useSearch` `filterBySpace` path; this hook is for two or more. It owns its
 * own query state and returns the same shape `useSearch` does, so the dialog can swap between them.
 */
export function useMultiSpaceSearch({
  spaceIds,
  filterByTypes,
  filterByTags,
  includeNonCanonical,
  enabled,
  initialQuery,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  spaceIds: string[];
  filterByTypes?: string[];
  filterByTags?: string[];
  includeNonCanonical?: boolean;
  enabled?: boolean;
  initialQuery?: string;
  pageSize?: number;
}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const [query, setQuery] = React.useState<string>(initialQuery ?? '');
  const debouncedQuery = useDebouncedValue(query);
  const cappedQuery = capSearchQuery(debouncedQuery);

  const filterTypeKey = React.useMemo(() => (filterByTypes ? [...filterByTypes].sort() : undefined), [filterByTypes]);
  const filterTagKey = React.useMemo(() => (filterByTags ? [...filterByTags].sort() : undefined), [filterByTags]);
  const spaceKey = React.useMemo(() => [...spaceIds].sort().join(','), [spaceIds]);

  const shouldSearch = (enabled ?? debouncedQuery !== '') && spaceIds.length > 0;

  const [pageCount, setPageCount] = React.useState(1);
  React.useEffect(() => {
    setPageCount(1);
  }, [cappedQuery, filterTypeKey, filterTagKey, spaceKey, includeNonCanonical]);

  const first = Math.min(pageCount * pageSize, MAX_ROWS_PER_SPACE);

  const queries = useQueries({
    queries: spaceIds.map(spaceId => ({
      enabled: shouldSearch,
      queryKey: [
        'multi-space-search',
        spaceId,
        cappedQuery,
        filterTypeKey,
        filterTagKey,
        includeNonCanonical,
        first,
      ] as const,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<SpacePage> => {
        try {
          const page = await E.findFuzzyPage({
            store,
            cache,
            where: {
              name: { fuzzy: cappedQuery },
              ...(filterByTypes?.length ? { types: filterByTypes.map(t => ({ id: { equals: t } })) } : {}),
              space: { id: { equals: spaceId } },
            },
            first,
            skip: 0,
            signal,
            includeNonCanonical,
            tagIds: filterByTags?.length ? filterByTags : undefined,
          });
          const results = !filterByTypes?.length
            ? page.results
            : page.results.filter(r => searchResultMatchesAllowedTypes(r, filterByTypes));
          return { results, total: page.total, succeeded: true };
        } catch (error) {
          if (isSearchCancellation(error, signal)) throw error;
          console.error(error);
          return { results: [], total: 0, succeeded: false };
        }
      },
      gcTime: Duration.toMillis(Duration.seconds(15)),
      throwOnError: false,
    })),
  });

  const results = React.useMemo(() => {
    const lists = queries.map(q => q.data?.results ?? []);
    const byId = new Map<string, SearchResult>();
    const order: string[] = [];
    const longest = lists.reduce((max, list) => Math.max(max, list.length), 0);
    for (let i = 0; i < longest; i++) {
      for (const list of lists) {
        const row = list[i];
        if (!row) continue;
        const existing = byId.get(row.id);
        if (!existing) {
          byId.set(row.id, row);
          order.push(row.id);
          continue;
        }
        const spaces = [...existing.spaces];
        for (const space of row.spaces) {
          if (!spaces.some(s => s.spaceId === space.spaceId)) spaces.push(space);
        }
        byId.set(row.id, { ...existing, spaces });
      }
    }
    return order.map(id => dedupeSearchResultTypeTags(byId.get(id)!));
  }, [queries]);

  const isFetching = queries.some(q => q.isFetching);
  const isFirstLoad = shouldSearch && pageCount === 1 && queries.some(q => q.isPending);
  const isQuerySyncing = query !== debouncedQuery;
  const isLoading = shouldSearch && (isQuerySyncing || isFirstLoad);
  const isFetchingNextPage = pageCount > 1 && isFetching;
  const hasNextPage = first < MAX_ROWS_PER_SPACE && queries.some(q => (q.data ? q.data.total > first : false));

  const fetchNextPage = React.useCallback(() => {
    if (!hasNextPage || isFetching) return;
    setPageCount(count => count + 1);
  }, [hasNextPage, isFetching]);

  return {
    query,
    onQueryChange: setQuery,
    results,
    isEmpty: results.length === 0 && shouldSearch && !isLoading,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  };
}
