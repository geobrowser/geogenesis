'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Effect, Either } from 'effect';

import { useState } from 'react';

import { useDebouncedValue } from '~/core/hooks/use-debounced-value';
import { Subgraph } from '~/core/io';

import { E } from '../sync/orm';
import { useSyncEngine } from '../sync/use-sync-engine';

const filterByTypes = ['362c1dbddc6444bba3c4652f38a642d7']; // Filter only space type entities

export function useSpacesQuery() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200);

  const { store } = useSyncEngine();
  const cache = useQueryClient();

  const { data: fuzzyMatchedSpaces = [] } = useQuery({
    queryKey: ['spaces-by-name', debouncedQuery],
    queryFn: async () => {
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
  });

  const spaces = fuzzyMatchedSpaces.map(space => {
    return { id: space.spaces[0].spaceId, name: space.name, image: space.spaces[0].image };
  });

  type SpaceItem = {
    id: string;
    name: string | null;
    image: string;
  };

  const uniqueSpacesById = (arr: SpaceItem[]): SpaceItem[] => {
    const seen = new Map<string, boolean>();
    return arr.reduce<SpaceItem[]>((acc, item) => {
      if (!seen.has(item.id)) {
        seen.set(item.id, true);
        acc.push(item);
      }
      return acc;
    }, []);
  };

  if (!fuzzyMatchedSpaces) {
    return {
      query,
      setQuery,
      spaces: [],
    };
  }

  return {
    query,
    setQuery,
    spaces: uniqueSpacesById(spaces),
  };
}
