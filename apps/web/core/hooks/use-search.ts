'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';

import { dedupeSearchResultTypeTags } from '~/core/utils/search-result-types';
import { validateEntityId } from '~/core/utils/utils';

import { mergeSearchResult } from '../database/result';
import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';
import type { SearchResult } from '../types';
import { useDebouncedValue } from './use-debounced-value';
import { useGlobalSearchSpaceIds } from './use-global-search-space-ids';

interface SearchOptions {
  filterByTypes?: string[];
  filterBySpace?: string;
  initialQuery?: string;
  waitForFilterTypes?: boolean;
  restrictToFilterTypes?: boolean;
  enabled?: boolean;
  pageSize?: number;
  /** Pass `false` to restrict results to the canonical graph. Defaults to including everything. */
  includeNonCanonical?: boolean;
}

const DEFAULT_SEARCH_PAGE_SIZE = 10;
const EMPTY_PAGE_PUMP_LIMIT = 3;

type SearchPage = {
  rows: SearchResult[];
  offset: number;
  serverCount: number;
  total: number;
};

const emptySearchPage = (offset: number): SearchPage => ({ rows: [], offset, serverCount: 0, total: 0 });

function normalizeTypeId(id: string): string {
  return id.replace(/-/g, '');
}

export function searchResultMatchesAllowedTypes(
  result: { types: { id: string }[] },
  filterByTypes: string[] | undefined
): boolean {
  if (!filterByTypes?.length) return true;
  const allowed = new Set(filterByTypes.flatMap(id => [id, normalizeTypeId(id)]));
  return result.types.some(t => allowed.has(t.id) || allowed.has(normalizeTypeId(t.id)));
}

export function entityTypesMatchFilter(
  types: { id: string }[] | undefined,
  relationTargetTypeIds: string[] | undefined
): boolean {
  return searchResultMatchesAllowedTypes({ types: types ?? [] }, relationTargetTypeIds);
}

function resultMatchesFilterTypes(result: { types: { id: string }[] }, filterByTypes: string[] | undefined): boolean {
  return searchResultMatchesAllowedTypes(result, filterByTypes);
}

export function useSearch({
  filterByTypes,
  filterBySpace,
  initialQuery,
  waitForFilterTypes,
  restrictToFilterTypes,
  enabled,
  pageSize = DEFAULT_SEARCH_PAGE_SIZE,
  includeNonCanonical,
}: SearchOptions = {}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const [query, setQuery] = React.useState<string>(initialQuery ?? '');
  const debouncedQuery = useDebouncedValue(query);

  const globalAdditionalSpaceIds = useGlobalSearchSpaceIds();
  const additionalSpaceIds = filterBySpace ? undefined : globalAdditionalSpaceIds;

  const maybeEntityId = debouncedQuery.trim();
  const filterTypeKey = React.useMemo(() => (filterByTypes ? [...filterByTypes].sort() : undefined), [filterByTypes]);

  const searchBlocked =
    (Boolean(waitForFilterTypes) && !filterByTypes?.length) ||
    (Boolean(restrictToFilterTypes) && !filterByTypes?.length);

  const shouldSearch = (enabled ?? debouncedQuery !== '') && !searchBlocked;

  const {
    data: resultPages,
    isPending: isSearchQueryPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    enabled: shouldSearch,
    queryKey: [
      'search',
      debouncedQuery,
      filterTypeKey,
      filterBySpace,
      Boolean(waitForFilterTypes),
      Boolean(restrictToFilterTypes),
      additionalSpaceIds,
      pageSize,
      includeNonCanonical,
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<SearchPage> => {
      try {
        const isValidEntityId = validateEntityId(maybeEntityId);

        if (isValidEntityId) {
          if (pageParam > 0) return emptySearchPage(pageParam);

          const merged = await mergeSearchResult({
            id: maybeEntityId,
            store,
          });
          if (!merged) return emptySearchPage(pageParam);
          if (filterByTypes?.length && !resultMatchesFilterTypes(merged, filterByTypes)) {
            return emptySearchPage(pageParam);
          }
          return { rows: [merged], offset: pageParam, serverCount: 1, total: 1 };
        }

        const page = await E.findFuzzyPage({
          store,
          cache,
          where: {
            name: {
              fuzzy: debouncedQuery,
            },
            ...(filterByTypes?.length
              ? {
                  types: filterByTypes.map(t => ({
                    id: {
                      equals: t,
                    },
                  })),
                }
              : {}),
            ...(filterBySpace ? { space: { id: { equals: filterBySpace } } } : {}),
          },
          first: pageSize,
          skip: pageParam,
          signal,
          additionalSpaceIds,
          includeNonCanonical,
        });

        const rows = !filterByTypes?.length
          ? page.results
          : page.results.filter(r => resultMatchesFilterTypes(r, filterByTypes));

        return { rows, offset: pageParam, serverCount: page.serverCount, total: page.total };
      } catch (error) {
        // Re-throw cancellations so React Query treats them as a cancel, not a
        // successful empty result. Returning `emptySearchPage` here would let RQ
        // cache the empty page under the canceled queryKey — leaving popovers
        // stuck on "No matches" when the key changes mid-fetch (e.g.
        // `additionalSpaceIds` settles after mount, or React StrictMode
        // double-mounts in dev).
        if (signal.aborted || (error as { name?: string })?.name === 'AbortError') {
          throw error;
        }
        console.error(error);
        return emptySearchPage(pageParam);
      }
    },
    getNextPageParam: lastPage => {
      const nextOffset = lastPage.offset + pageSize;
      return nextOffset >= lastPage.total ? undefined : nextOffset;
    },
    /**
     * We don't want to return stale search results. Instead we just
     * delete the cache after 15 seconds. Otherwise the query might
     * return a results list that has stale data. This stale data
     * might get revalidated behind the scenes resulting in layout
     * shift or confusing results.
     */
    gcTime: Duration.toMillis(Duration.seconds(15)),
    throwOnError: false,
  });

  const emptyPagePumpCountRef = React.useRef(0);

  React.useEffect(() => {
    const lastPage = resultPages?.pages.at(-1);
    if (!lastPage) {
      emptyPagePumpCountRef.current = 0;
      return;
    }

    if (lastPage.rows.length > 0 || !hasNextPage) {
      emptyPagePumpCountRef.current = 0;
      return;
    }

    if (
      lastPage.serverCount < pageSize ||
      isFetchingNextPage ||
      emptyPagePumpCountRef.current >= EMPTY_PAGE_PUMP_LIMIT
    ) {
      return;
    }

    emptyPagePumpCountRef.current += 1;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, pageSize, resultPages]);

  const results = React.useMemo(() => {
    const seen = new Set<string>();
    const rows: NonNullable<typeof resultPages>['pages'][number]['rows'] = [];
    for (const row of resultPages?.pages.flatMap(page => page.rows) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(dedupeSearchResultTypeTags(row));
    }
    return rows;
  }, [resultPages]);

  const isQuerySyncing = query !== debouncedQuery;
  const isWaitingForFilterTypes = shouldSearch === false && searchBlocked && (enabled ?? debouncedQuery !== '');
  /** Pending = no usable data yet (RQ v5); avoids treating the pre-fetch tick as “loaded empty”. */
  const shouldSuspend = isWaitingForFilterTypes || isQuerySyncing || isSearchQueryPending;

  return {
    isEmpty: isArrayEmpty(results) && (Boolean(enabled) || !isStringEmpty(query)) && !shouldSuspend,
    isLoading: shouldSuspend,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    results,
    query,
    onQueryChange: setQuery,
  };
}

function isArrayEmpty<T>(array: T[]): boolean {
  return array.length === 0;
}

function isStringEmpty(value: string): boolean {
  return value === '';
}
