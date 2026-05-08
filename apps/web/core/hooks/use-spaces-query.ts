'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useState } from 'react';

import { Effect, Either } from 'effect';

import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { Subgraph } from '~/core/io';

import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';

const filterByTypes = ['362c1dbddc6444bba3c4652f38a642d7']; // Filter only space type entities

export type UseSpacesQueryOptions = {
  matchLimit?: number;
  allowEmptyQuery?: boolean;
};

export function useSpacesQuery(enabled = true, options?: UseSpacesQueryOptions) {
  const matchLimit = options?.matchLimit ?? 10;
  const allowEmptyQuery = options?.allowEmptyQuery ?? false;
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);

  const { store } = useSyncEngine();
  const cache = useQueryClient();

  const {
    data: fuzzyMatchedSpacePages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['spaces-by-name', debouncedQuery, matchLimit],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
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
                types: filterByTypes?.map(t => {
                  return {
                    id: {
                      equals: t,
                    },
                  };
                }),
              },
              first: matchLimit,
              skip: pageParam,
              signal,
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
            return { rows: [], offset: pageParam, rawCount: 0, total: 0 };
          default:
            console.error('useSearch error:', String(error));
            throw error;
        }
      }

      return {
        rows: resultOrError.right.results,
        offset: pageParam,
        rawCount: resultOrError.right.rawCount,
        total: resultOrError.right.total,
      };
    },
    getNextPageParam: lastPage => {
      const nextOffset = lastPage.offset + matchLimit;
      return nextOffset >= lastPage.total ? undefined : nextOffset;
    },
    enabled: enabled && (allowEmptyQuery || debouncedQuery.trim().length > 0),
  });

  const fuzzyMatchedSpaces = fuzzyMatchedSpacePages?.pages.flatMap(page => page.rows) ?? [];

  const spaces = fuzzyMatchedSpaces.flatMap(entity => {
    return entity.spaces.map(space => ({
      id: space.spaceId,
      name: space.name ?? entity.name,
      description: space.description ?? entity.description,
      image: space.image,
    }));
  });

  type SpaceItem = {
    id: string;
    name: string | null;
    description: string | null;
    image: string;
  };

  const uniqueSpacesById = (arr: SpaceItem[]): SpaceItem[] => {
    const byId = new Map<string, SpaceItem>();
    for (const item of arr) {
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        continue;
      }

      byId.set(item.id, {
        ...existing,
        name: existing.name ?? item.name,
        description: existing.description ?? item.description,
        image: existing.image || item.image,
      });
    }
    return [...byId.values()];
  };

  return {
    query,
    setQuery,
    spaces: uniqueSpacesById(spaces),
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  };
}
