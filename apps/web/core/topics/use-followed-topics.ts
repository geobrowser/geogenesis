'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { fetchFollowedTopics, followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import { fetchInterestedTopics, interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';

import { isInterestedFollowEnabled, mergeFollowedTopicIds } from './interested';

export function followedTopicsQueryOptions(spaceId: string) {
  return queryOptions({
    queryKey: followedTopicsQueryKey(spaceId),
    queryFn: ({ signal }) => fetchFollowedTopics(spaceId, signal),
    staleTime: 60_000,
  });
}

/** The topics a space holds Interested on (GEO-3158). Only read with the Interested-follow flag on. */
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
 * With the Interested-follow flag on (GEO-3158), a topic is followed if the space has a
 * `Following` relation to it OR holds Interested on it, so follows made before the switch keep
 * working. `rows` stays the relations only: it is what an unfollow tombstones. Read `topicIds` for
 * "is this followed", never `rows`.
 */
export function useFollowedTopics(spaceId?: string) {
  const { personalSpaceId, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  const targetSpaceId = spaceId ?? personalSpaceId;
  const interestedEnabled = isInterestedFollowEnabled();

  const { data, isLoading } = useQuery({
    ...followedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId,
  });
  const { data: interested, isLoading: isLoadingInterested } = useQuery({
    ...interestedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId && interestedEnabled,
  });

  const topicIds = React.useMemo(
    () => mergeFollowedTopicIds(data ?? [], interestedEnabled ? (interested ?? []) : []),
    [data, interested, interestedEnabled]
  );

  return {
    topicIds,
    rows: data ?? [],
    isLoading: isLoading || (interestedEnabled && isLoadingInterested) || (!spaceId && isLoadingPersonalSpace),
  };
}
