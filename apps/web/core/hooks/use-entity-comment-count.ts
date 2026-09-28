'use client';

import { useQuery } from '@tanstack/react-query';

import * as Effect from 'effect/Effect';

import { getEntityCommentCount } from '~/core/io/queries';

import { useCommentCount } from './use-comment-count';

/** A lightweight server count that follows optimistic and published updates once comments load. */
export function useEntityCommentCount(entityId: string) {
  const query = useQuery({
    queryKey: ['entity-comment-count', entityId],
    queryFn: ({ signal }) => Effect.runPromise(getEntityCommentCount(entityId, signal)),
    staleTime: 60_000,
    enabled: entityId.length > 0,
  });
  const count = useCommentCount(entityId, query.data ?? 0);

  return { count, isLoading: query.isLoading };
}
