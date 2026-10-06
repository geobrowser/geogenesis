'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { fetchFollowedTopics, followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import { fetchInterestedTopics, interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';
import { normId } from '~/core/utils/norm-id';

import { interestedTopicIds, isInterestedFollowEnabled } from './interested';

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
 * With the Interested-follow flag on (GEO-3158), a topic is followed exactly when the space holds a
 * current Interested on it. `Following` relations are not read at all and `rows` is empty: read
 * `topicIds` for "is this followed", never `rows`.
 */
export function useFollowedTopics(spaceId?: string) {
  const { personalSpaceId, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  const targetSpaceId = spaceId ?? personalSpaceId;
  const interestedEnabled = isInterestedFollowEnabled();

  const { data, isLoading } = useQuery({
    ...followedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId && !interestedEnabled,
  });
  const { data: interested, isLoading: isLoadingInterested } = useQuery({
    ...interestedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId && interestedEnabled,
  });

  const topicIds = React.useMemo(
    () =>
      interestedEnabled
        ? interestedTopicIds(interested ?? [])
        : new Set((data ?? []).map(row => normId(row.toEntityId))),
    [data, interested, interestedEnabled]
  );

  return {
    topicIds,
    rows: interestedEnabled ? [] : (data ?? []),
    isLoading: (interestedEnabled ? isLoadingInterested : isLoading) || (!spaceId && isLoadingPersonalSpace),
  };
}
