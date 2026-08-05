'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { type UserEntityVoteObjectIdsPage, getUserEntityVoteObjectIdsPage } from '~/core/io/queries';

export type EntityVoteDirectionFilter = 'up' | 'down';

const VOTE_TYPE_BY_DIRECTION: Record<EntityVoteDirectionFilter, 0 | 1> = {
  up: 0,
  down: 1,
};

export const USER_ENTITY_VOTES_QUERY_KEY_ROOT = 'user-entity-votes';

export function userEntityVotesQueryKey(
  personalSpaceId: string | null | undefined,
  direction: EntityVoteDirectionFilter
) {
  return [USER_ENTITY_VOTES_QUERY_KEY_ROOT, personalSpaceId ?? null, direction] as const;
}

export function useUserVotedEntityIds(direction: EntityVoteDirectionFilter, enabled = true) {
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const voteType = VOTE_TYPE_BY_DIRECTION[direction];
  const canFetch = enabled && Boolean(personalSpaceId) && isRegistered;

  const query = useInfiniteQuery({
    queryKey: userEntityVotesQueryKey(personalSpaceId, direction),
    queryFn: async ({ pageParam, signal }) => {
      if (!personalSpaceId) {
        return { objectIds: [], endCursor: null, hasNextPage: false } satisfies UserEntityVoteObjectIdsPage;
      }
      return Effect.runPromise(getUserEntityVoteObjectIdsPage(personalSpaceId, voteType, 0, pageParam, signal));
    },
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => (lastPage.hasNextPage ? lastPage.endCursor : undefined),
    enabled: canFetch,
    staleTime: 30_000,
  });

  const ids = React.useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const page of query.data?.pages ?? []) {
      for (const id of page.objectIds) {
        if (!id) continue;
        const hexId = ID.uuidToHex(id);
        if (seen.has(hexId)) continue;
        seen.add(hexId);
        ordered.push(hexId);
      }
    }

    return ordered;
  }, [query.data]);

  return {
    ids,
    isLoading: canFetch && query.isLoading,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
