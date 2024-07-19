'use client';

import { A, S } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';

import { Services } from '../services';

interface SearchOptions {
  allowedTypes?: string[];
}

export function useSearch({ allowedTypes }: SearchOptions = {}) {
  const { subgraph } = Services.useServices();

  const [query, setQuery] = React.useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query, allowedTypes],
    queryFn: async ({ signal }) => {
      if (query.length === 0) return [];

      const fetchResultsEffect = Effect.either(
        Effect.tryPromise({
          try: async () =>
            await subgraph.fetchResults({
              query,
              signal,
              typeIds: allowedTypes,
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
    isEmpty: A.isEmpty(results ?? []) && S.isNotEmpty(query) && !isLoading,
    isLoading,
    results: query ? results ?? [] : [],
    query,
    onQueryChange: setQuery,
  };
}
