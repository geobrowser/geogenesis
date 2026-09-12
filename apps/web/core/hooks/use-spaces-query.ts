'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { useState } from 'react';

import { isSearchCancellation } from '~/core/hooks/search-cancellation';
import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { capSearchQuery } from '~/core/io/search-query';

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
  const cappedQuery = capSearchQuery(debouncedQuery);

  const { store } = useSyncEngine();
  const cache = useQueryClient();

  const {
    data: fuzzyMatchedSpacePages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    // The capped query, so typing past the cap stops re-running a search that cannot change.
    queryKey: ['spaces-by-name', cappedQuery, matchLimit],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      try {
        const page = await E.findFuzzyPage({
          store,
          cache,
          where: {
            name: {
              fuzzy: cappedQuery,
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
        });

        return { rows: page.results, offset: pageParam, rawCount: page.rawCount, total: page.total };
      } catch (error) {
        // Re-throw cancellations for the same reason `useSearch` does: returning an
        // empty page here caches "no matches" under this key, and the key only
        // changes when the query text does, so the space picker sits empty until
        // the searcher types another character. This hook shares `findFuzzyPage`
        // with `useSearch`, so it shares the deduplicated inner fetch that made
        // somebody else's cancellation arrive here.
        if (isSearchCancellation(error, signal)) throw error;

        // Genuine failures still degrade to an empty page rather than throwing at
        // the picker, which is what this did before — but they are now logged as
        // themselves. Every rejection used to be relabelled `AbortError` and then
        // handled as one, so a real failure was silently indistinguishable from a
        // cancelled keystroke and the branch meant to re-throw it was unreachable.
        console.error('useSpacesQuery error:', error);
        return { rows: [], offset: pageParam, rawCount: 0, total: 0 };
      }
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
