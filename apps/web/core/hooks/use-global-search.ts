'use client';

import { A, S } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';

import { useMergedData } from './use-merged-data';

export function useGlobalSearch() {
  const merged = useMergedData();
  const [query, setQuery] = React.useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['globalSearch', query],
    queryFn: async ({ signal }) => {
      if (query.length === 0) return [];

      const fetchEntitiesEffect = Effect.either(
        Effect.tryPromise({
          try: () =>
            merged.fetchEntities({
              query,
              signal,
              first: 100,
              filter: [],
            }),
          catch: () => new Subgraph.Errors.AbortError(),
        })
      );

      const resultOrError = await Effect.runPromise(fetchEntitiesEffect);

      if (Either.isLeft(resultOrError)) {
        const error = resultOrError.left;

        switch (error._tag) {
          case 'AbortError':
            return [];
          default:
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
