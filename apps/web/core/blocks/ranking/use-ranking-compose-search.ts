'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';

import type { Filter } from '~/core/blocks/data/filters';
import { getScopeFromFilters } from '~/core/blocks/ranking/ranking-scope';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { useGlobalSearchSpaceIds } from '~/core/hooks/use-global-search-space-ids';
import { searchResultMatchesAllowedTypes } from '~/core/hooks/use-search';
import { E } from '~/core/sync/orm';
import { useSyncEngine } from '~/core/sync/use-sync-engine';
import type { SearchResult } from '~/core/types';

const SEARCH_PAGE_SIZE = 25;

function getFilterByTypes(filterState: Filter[]): string[] {
  return filterState.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => f.value);
}

export function useRankingComposeSearch({
  filterState,
  query,
  enabled,
}: {
  filterState: Filter[];
  query: string;
  enabled: boolean;
}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const debouncedQuery = useDebouncedValue(query);
  const globalAdditionalSpaceIds = useGlobalSearchSpaceIds();

  const filterByTypes = React.useMemo(() => getFilterByTypes(filterState), [filterState]);
  const filterByTypesKey = filterByTypes.slice().sort().join(',');

  const scope = React.useMemo(() => getScopeFromFilters(filterState), [filterState]);
  const scopeSpaceId = scope.type === 'SPACES' && scope.value.length === 1 ? scope.value[0] : undefined;
  const additionalSpaceIds = React.useMemo(() => {
    if (scope.type === 'SPACES' && scope.value.length > 1) {
      return [...new Set([...scope.value, ...globalAdditionalSpaceIds])];
    }
    return globalAdditionalSpaceIds;
  }, [scope, globalAdditionalSpaceIds]);

  const trimmedQuery = debouncedQuery.trim();
  const shouldSearch = enabled && trimmedQuery.length > 0;

  const {
    data: searchPages,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['ranking-compose-search', trimmedQuery, filterByTypesKey, scopeSpaceId, additionalSpaceIds],
    enabled: shouldSearch,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const { results, rawCount, total } = await E.findFuzzyPage({
        store,
        cache,
        where: {
          name: { fuzzy: trimmedQuery },
          ...(filterByTypes.length ? { types: filterByTypes.map(id => ({ id: { equals: id } })) } : {}),
          ...(scopeSpaceId ? { space: { id: { equals: scopeSpaceId } } } : {}),
        },
        first: SEARCH_PAGE_SIZE,
        skip: pageParam,
        signal,
        additionalSpaceIds,
      });
      return { rows: results, offset: pageParam, rawCount, total };
    },
    getNextPageParam: lastPage => {
      const nextOffset = lastPage.offset + SEARCH_PAGE_SIZE;
      if (typeof lastPage.total === 'number') {
        return nextOffset >= lastPage.total ? undefined : nextOffset;
      }
      return lastPage.rawCount < SEARCH_PAGE_SIZE ? undefined : nextOffset;
    },
    staleTime: Duration.toMillis(Duration.seconds(60)),
  });

  const results = React.useMemo(() => {
    const seen = new Set<string>();
    const rows: SearchResult[] = [];
    for (const row of searchPages?.pages.flatMap(page => page.rows) ?? []) {
      if (filterByTypes.length && !searchResultMatchesAllowedTypes(row, filterByTypes)) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    return rows;
  }, [searchPages, filterByTypes]);

  const isQuerySyncing = query.trim() !== trimmedQuery;
  const isLoading = shouldSearch && (isQuerySyncing || isFetching || isPending);
  const isSettled = shouldSearch && !isQuerySyncing && !isFetching && !isPending;

  const [lastSettledHadNoResults, setLastSettledHadNoResults] = React.useState(false);

  React.useEffect(() => {
    if (!isSettled) return;
    setLastSettledHadNoResults(results.length === 0);
  }, [isSettled, results.length]);

  React.useEffect(() => {
    if (!enabled || query.trim().length === 0) {
      setLastSettledHadNoResults(false);
    }
  }, [enabled, query]);

  const isDebouncingAfterEmptySearch = shouldSearch && isQuerySyncing && !isFetching && lastSettledHadNoResults;

  return {
    results,
    isLoading,
    isSettled,
    isDebouncingAfterEmptySearch,
    isFetching,
    isFetchingNextPage: Boolean(isFetchingNextPage),
    hasNextPage: shouldSearch ? Boolean(hasNextPage) : false,
    fetchNextPage,
  };
}
