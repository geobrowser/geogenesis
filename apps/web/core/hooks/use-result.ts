'use client';

import { useQuery } from '@tanstack/react-query';
import * as Effect from 'effect/Effect';
import * as Either from 'effect/Either';

import { Subgraph } from '~/core/io';
import { EntityId } from '~/core/io/schema';

import { mergeSearchResult } from '../database/result';
import { useSyncEngine } from '../sync/use-sync-engine';

export const useResult = (id: EntityId) => {
  const { store } = useSyncEngine();

  const { data: result, isLoading } = useQuery({
    queryKey: ['result', id],
    queryFn: async () => {
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
            return null;
          default:
            console.error('useSearch error:', String(error));
            throw error;
        }
      }

      return resultOrError.right ? resultOrError.right : null;
    },
  });

  return { result, isLoading };
};
