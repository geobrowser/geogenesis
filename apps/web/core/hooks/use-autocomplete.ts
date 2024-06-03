'use client';

import { A, S } from '@mobily/ts-belt';
import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import * as React from 'react';

import { Subgraph } from '~/core/io';

import { FilterState } from '../types';
import { useMergedData } from './use-merged-data';

interface AutocompleteOptions {
  filter?: FilterState;
  allowedTypes?: string[];
}

export function useAutocomplete({ allowedTypes, filter }: AutocompleteOptions = {}) {
  const merged = useMergedData();

  const [query, setQuery] = React.useState('');

  const { data: results, isLoading } = useQuery({
    queryKey: ['autocomplete', query, filter, allowedTypes],
    queryFn: async ({ signal }) => {
      if (query.length === 0) return [];

      const fetchEntitiesEffect = Effect.either(
        Effect.tryPromise({
          try: () =>
            merged.fetchEntities({
              query,
              signal,
              filter: filter ?? [],
              typeIds: allowedTypes,
              first: 10,
            }),
          catch: () => {
            return new Subgraph.Errors.AbortError();
          },
        })
      );

      const resultOrError = await Effect.runPromise(fetchEntitiesEffect);

      if (Either.isLeft(resultOrError)) {
        const error = resultOrError.left;

        switch (error._tag) {
          case 'AbortError':
            return [];
          default:
            console.error('useAutocomplete error:', String(error));
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
