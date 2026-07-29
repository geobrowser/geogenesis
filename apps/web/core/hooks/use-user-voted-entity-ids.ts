'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { getUserEntityVoteObjectIds } from '~/core/io/queries';

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

  const query = useQuery({
    queryKey: userEntityVotesQueryKey(personalSpaceId, direction),
    queryFn: async ({ signal }) => {
      if (!personalSpaceId) return [] as string[];
      return Effect.runPromise(getUserEntityVoteObjectIds(personalSpaceId, voteType, 0, signal));
    },
    enabled: canFetch,
    staleTime: 30_000,
  });

  const votedIdSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const id of query.data ?? []) {
      if (id) set.add(ID.uuidToHex(id));
    }
    return set;
  }, [query.data]);

  return {
    votedIdSet,
    isLoading: canFetch && query.isLoading,
  };
}
