'use client';

import { useQuery } from '@tanstack/react-query';
import { Duration } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { EntityId } from '~/core/io/schema';
import { validateEntityId } from '~/core/utils/utils';

import { mergeSearchResult } from '../database/result';
import { mergeSearchResults } from '../database/results';
import { useDebouncedValue } from './use-debounced-value';

interface SearchOptions {
  filterByTypes?: string[];
}

export function useSearch({ filterByTypes }: SearchOptions = {}) {
  const [query, setQuery] = React.useState<string>('');
  const debouncedQuery = useDebouncedValue(query);

  const maybeEntityId = debouncedQuery.trim();

  const { data: results, isLoading } = useQuery({
    enabled: debouncedQuery !== '',
    queryKey: ['search', debouncedQuery, filterByTypes],
    queryFn: async ({ signal }) => {
      if (query.length === 0) return [];

      const isValidEntityId = validateEntityId(maybeEntityId);

      if (isValidEntityId) {
        const id = EntityId(maybeEntityId);

        const fetchResultEffect = Effect.either(
          Effect.tryPromise({
            try: async () =>
              await mergeSearchResult({
                id,
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

        return [resultOrError.right];
      }

      const fetchResultsEffect = Effect.either(
        Effect.tryPromise({
          try: async () =>
            await mergeSearchResults({
              filters: [
                {
                  type: 'NAME',
                  value: debouncedQuery,
                },
                {
                  type: 'TYPES',
                  value: filterByTypes ?? [],
                },
              ],
              signal,
              first: 10,
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
    staleTime: Duration.toMillis(Duration.seconds(5)),
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
