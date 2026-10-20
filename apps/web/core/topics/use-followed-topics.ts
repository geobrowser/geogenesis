'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { fetchInterestedTopics, interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';
import { normId } from '~/core/utils/norm-id';

import { type FollowKind, followKindOf, interestedTopicIds } from './interested';

/** The topics and people a space holds Interested on (GEO-3158): its follows. */
export function interestedTopicsQueryOptions(spaceId: string) {
  return queryOptions({
    queryKey: interestedTopicsQueryKey(spaceId),
    queryFn: ({ signal }) => fetchInterestedTopics(spaceId, signal),
    staleTime: 60_000,
  });
}

/**
 * Topics a personal space follows (default: the viewer's), as normalized ids. Disable follow
 * controls while `isLoading`, or an early click writes a duplicate row.
 *
 * A topic is followed exactly when the space holds a current Interested on it (GEO-3158).
 */
export function useFollowedTopics(spaceId?: string) {
  return useFollowedEntities({ spaceId, kind: 'topic' });
}

/**
 * Everything a personal space follows (default: the viewer's) as Interested votes (GEO-3236):
 * people, by personal space id, and topics, as normalized ids in one set. Its size is the space's
 * following count.
 */
export function useFollowedInterests(spaceId?: string) {
  const { topicIds, kinds, isLoading } = useFollowedEntities({ spaceId, kind: 'any' });
  return { ids: topicIds, kinds, isLoading };
}

/** The followed set for a kind of follow; see `useFollowedTopics` and `useFollowedInterests`. */
export function useFollowedEntities({
  spaceId,
  kind,
}: {
  spaceId?: string;
  /** Which follows to return. A topic and a person are both Interested, so one read holds both. */
  kind: FollowKind | 'any';
}) {
  const { personalSpaceId, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  const targetSpaceId = spaceId ?? personalSpaceId;

  const { data: interested, isLoading } = useQuery({
    ...interestedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId,
  });

  const topicIds = React.useMemo(() => interestedTopicIds(interested ?? [], kind), [interested, kind]);
  const kinds = React.useMemo(
    () => new Map((interested ?? []).map(row => [normId(row.objectId), followKindOf(row)] as const)),
    [interested]
  );

  return {
    topicIds,
    /** What each Interested id is, for a list that holds both kinds. */
    kinds,
    isLoading: isLoading || (!spaceId && isLoadingPersonalSpace),
  };
}
