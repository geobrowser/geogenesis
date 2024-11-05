'use client';

import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';

import { mergeSearchResults } from '../database/results';

interface SearchOptions {
  filterByTypes?: string[];
}

export function useSearch({ filterByTypes }: SearchOptions = {}) {
  const [query, setQuery] = React.useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query, filterByTypes],
    queryFn: async ({ signal }) => {
      if (query.length === 0) return [];

      const fetchResultsEffect = Effect.either(
        Effect.tryPromise({
          try: async () =>
            // @TODO(database): merged
            await mergeSearchResults({
              name: query,
              signal,
              typeIds: filterByTypes,
              first: 10,
            }),
          catch: () => {
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
    staleTime: 10,
  });

  return {
    isEmpty: isArrayEmpty(results ?? []) && !isStringEmpty(query) && !isLoading,
    isLoading,
    results: query ? results ?? [] : [],
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
