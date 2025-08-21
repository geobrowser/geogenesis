import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Duration } from 'effect';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { useCallback, useEffect, useState } from 'react';

import { Subgraph } from '~/core/io';
import { EntityId } from '~/core/io/schema';
import { validateEntityId } from '~/core/utils/utils';

import { mergeSearchResult } from '../database/result';
import { SearchResultDto } from '../io/dto/search';
import { E } from '../sync/orm';
import { SearchResult } from '../v2.types';
import { useSyncEngine } from '../sync/use-sync-engine';
import { PLACE_TYPE } from '../system-ids';
import { useDebouncedValue } from './use-debounced-value';

export type Feature = {
  place_name: string;
  mapbox_id: string;
  text: string;
};

export const usePlaceSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setPlacesResults] = useState<Feature[]>([]);
  const [resultEntities, setResultEntities] = useState<SearchResult[] | undefined>();
  const [isEmpty, setIsEmpty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 1000);

  const { store } = useSyncEngine();
  const cache = useQueryClient();

  const maybeEntityId = debouncedQuery.trim();

  // TODO replace with a proper system ID import
  const mockFilterByTypes = [PLACE_TYPE];

  const { isLoading: isEntitiesLoading } = useQuery({
    enabled: debouncedQuery !== '',
    queryKey: ['search', debouncedQuery, mockFilterByTypes],
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
        console.log('resultOrError.right', resultOrError.right);
        if (resultOrError.right) setResultEntities([resultOrError.right]);
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
                // Hardcoded
                types: mockFilterByTypes?.map(t => {
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

      console.log('resultOrError.right', resultOrError.right);

      setResultEntities(resultOrError.right);
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

  const handleSearch = useCallback(async () => {
    if (query === '') {
      setPlacesResults([]);
      setIsLoading(false);
      return;
    }
    try {
      let sessionToken = sessionStorage.getItem('mapboxSessionToken');

      if (!sessionToken) {
        sessionToken = crypto.randomUUID();
        sessionStorage.setItem('mapboxSessionToken', sessionToken);
      }

      const res = await fetch(`/api/places/search?query=${encodeURIComponent(query)}&sessionToken=${sessionToken}`);
      const data = await res.json();
      setPlacesResults(data.suggestions || []);
      if (!data.suggestions.length) {
        setIsEmpty(true);
      }
    } catch (error: any) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const onQueryChange = (value: string) => {
    setIsLoading(true);
    setQuery(value);
  };

  useEffect(() => {
    handleSearch();
  }, [debouncedQuery, handleSearch]);

  return {
    results,
    onQueryChange,
    isLoading,
    query,
    isEmpty,
    resultEntities,
    isEntitiesLoading,
  };
};
