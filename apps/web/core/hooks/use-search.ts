'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Duration } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { EntityId } from '~/core/io/schema';
import { validateEntityId } from '~/core/utils/utils';

import { mergeSearchResult } from '../database/result';
import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';
import { useDebouncedValue } from './use-debounced-value';

interface SearchOptions {
  filterByTypes?: string[];
}

export function useSearch({ filterByTypes }: SearchOptions = {}) {
  const { store } = useSyncEngine();
  const cache = useQueryClient();
  const [query, setQuery] = React.useState<string>('');
  const debouncedQuery = useDebouncedValue(query);

  const maybeEntityId = debouncedQuery.trim();

  const { data: results, isLoading } = useQuery({
    enabled: debouncedQuery !== '',
    queryKey: ['search', debouncedQuery, filterByTypes],
    queryFn: async () => {
      if (query.length === 0) return [];

      const isValidEntityId = validateEntityId(maybeEntityId);

      if (isValidEntityId) {
        const id = EntityId(maybeEntityId);

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

        return resultOrError.right ? [resultOrError.right] : [];
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
                types: filterByTypes?.map(t => {
                  return {
                    id: {
                      equals: t,
                    },
                  };
                }),
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

      return resultOrError.right;
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
