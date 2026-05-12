'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Subgraph } from '~/core/io';
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
}

const DEFAULT_SEARCH_PAGE_SIZE = 10;
const EMPTY_PAGE_PUMP_LIMIT = 3;

type SearchPage = {
  rows: SearchResult[];
  offset: number;
  rawCount: number;
  total: number;
};

const emptySearchPage = (offset: number): SearchPage => ({ rows: [], offset, rawCount: 0, total: 0 });

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
}: SearchOptions = {}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const [query, setQuery] = React.useState<string>(initialQuery ?? '');
  const debouncedQuery = useDebouncedValue(query);

  const additionalSpaceIds = useGlobalSearchSpaceIds();

  const maybeEntityId = debouncedQuery.trim();
  const filterTypeKey = React.useMemo(() => (filterByTypes ? [...filterByTypes].sort() : undefined), [filterByTypes]);

  const searchBlocked =
    (Boolean(waitForFilterTypes) && !filterByTypes?.length) ||
    (Boolean(restrictToFilterTypes) && !filterByTypes?.length);

  const shouldSearch = (enabled ?? debouncedQuery !== '') && !searchBlocked;

  const {
    data: resultPages,
    isLoading,
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
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }): Promise<SearchPage> => {
      const isValidEntityId = validateEntityId(maybeEntityId);

      if (isValidEntityId) {
        if (pageParam > 0) return emptySearchPage(pageParam);

        const id = maybeEntityId;

        const fetchResultEffect = Effect.either(
          Effect.tryPromise({
            try: async () =>
              await mergeSearchResult({
                id,
                store,
              }),
            catch: error => {
              console.error('error', error);
              return new Subgraph.Errors.AbortError();
            },
          })
        );

        const resultOrError = await Effect.runPromise(fetchResultEffect);

        if (Either.isLeft(resultOrError)) {
          const error = resultOrError.left;

          switch (error._tag) {
            case 'AbortError':
              console.log(`abort error`);
              return emptySearchPage(pageParam);
            default:
              console.error('useSearch error:', String(error));
              throw error;
          }
        }

        const merged = resultOrError.right;
        if (!merged) return emptySearchPage(pageParam);
        if (filterByTypes?.length && !resultMatchesFilterTypes(merged, filterByTypes)) {
          return emptySearchPage(pageParam);
        }
        return { rows: [merged], offset: pageParam, rawCount: 1, total: 1 };
      }

      const fetchResultsEffect = Effect.either(
        Effect.tryPromise({
          try: async () =>
            await E.findFuzzyPage({
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
            }),
          catch: error => {
            console.error('error', error);
            return new Subgraph.Errors.AbortError();
          },
        })
      );

      const resultOrError = await Effect.runPromise(fetchResultsEffect);

      if (Either.isLeft(resultOrError)) {
        const error = resultOrError.left;

        switch (error._tag) {
          case 'AbortError':
            console.log(`abort error`);
            return emptySearchPage(pageParam);
          default:
            console.error('useSearch error:', String(error));
            throw error;
        }
      }

      const page = resultOrError.right;
      const rows = !filterByTypes?.length
        ? page.results
        : page.results.filter(r => resultMatchesFilterTypes(r, filterByTypes));

      return { rows, offset: pageParam, rawCount: page.rawCount, total: page.total };
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

    if (lastPage.rawCount < pageSize || isFetchingNextPage || emptyPagePumpCountRef.current >= EMPTY_PAGE_PUMP_LIMIT) {
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
  const shouldSuspend = isWaitingForFilterTypes || isQuerySyncing || isLoading;

  return {
    isEmpty:
      isArrayEmpty(results) && (Boolean(enabled) || !isStringEmpty(query)) && !shouldSuspend,
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
