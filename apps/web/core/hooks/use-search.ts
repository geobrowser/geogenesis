'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Subgraph } from '~/core/io';
import { validateEntityId } from '~/core/utils/utils';

import { mergeSearchResult } from '../database/result';
import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';
import { useDebouncedValue } from './use-debounced-value';

interface SearchOptions {
  filterByTypes?: string[];
  filterBySpace?: string;
  initialQuery?: string;
  waitForFilterTypes?: boolean;
}

function resultMatchesFilterTypes(
  result: { types: { id: string }[] },
  filterByTypes: string[] | undefined
): boolean {
  if (!filterByTypes?.length) return true;
  const allowed = new Set(filterByTypes);
  return result.types.some(t => allowed.has(t.id));
}

export function useSearch({
  filterByTypes,
  filterBySpace,
  initialQuery,
  waitForFilterTypes,
}: SearchOptions = {}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const [query, setQuery] = React.useState<string>(initialQuery ?? '');
  const debouncedQuery = useDebouncedValue(query);

  const maybeEntityId = debouncedQuery.trim();

  const searchBlocked = Boolean(waitForFilterTypes) && !filterByTypes?.length;

  const { data: results, isLoading } = useQuery({
    enabled: debouncedQuery !== '' && !searchBlocked,
    queryKey: ['search', debouncedQuery, filterByTypes?.join('-'), filterBySpace, Boolean(waitForFilterTypes)],
    queryFn: async () => {
      if (query.length === 0) return [];

      const isValidEntityId = validateEntityId(maybeEntityId);

      if (isValidEntityId) {
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
              return [];
            default:
              console.error('useSearch error:', String(error));
              throw error;
          }
        }

        const merged = resultOrError.right;
        if (!merged) return [];
        if (filterByTypes?.length && !resultMatchesFilterTypes(merged, filterByTypes)) {
          return [];
        }
        return [merged];
      }

      const fetchResultsEffect = Effect.either(
        Effect.tryPromise({
          try: async () =>
            await E.findFuzzy({
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
              first: 10,
              skip: 0,
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
            return [];
          default:
            console.error('useSearch error:', String(error));
            throw error;
        }
      }

      const rows = resultOrError.right;
      if (!filterByTypes?.length) return rows;
      return rows.filter(r => resultMatchesFilterTypes(r, filterByTypes));
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

  const isQuerySyncing = query !== debouncedQuery;
  const shouldSuspend = isQuerySyncing || isLoading;

  return {
    isEmpty: isArrayEmpty(results ?? []) && !isStringEmpty(query) && !shouldSuspend,
    isLoading: shouldSuspend,
    results: results ?? [],
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
