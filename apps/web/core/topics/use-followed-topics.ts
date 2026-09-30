'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { fetchFollowedTopics, followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import { normId } from '~/core/utils/norm-id';

export function followedTopicsQueryOptions(spaceId: string) {
  return queryOptions({
    queryKey: followedTopicsQueryKey(spaceId),
    queryFn: ({ signal }) => fetchFollowedTopics(spaceId, signal),
    staleTime: 60_000,
  });
}

/**
 * Topics a personal space follows (default: the viewer's), as normalized ids. Disable follow
 * controls while `isLoading`, or an early click writes a duplicate row.
 */
export function useFollowedTopics(spaceId?: string) {
  const { personalSpaceId, isLoading: isLoadingPersonalSpace } = usePersonalSpaceId();
  const targetSpaceId = spaceId ?? personalSpaceId;

  const { data, isLoading } = useQuery({
    ...followedTopicsQueryOptions(targetSpaceId ?? ''),
    enabled: !!targetSpaceId,
  });

  const topicIds = React.useMemo(() => new Set((data ?? []).map(row => normId(row.toEntityId))), [data]);

  return {
    topicIds,
    rows: data ?? [],
    isLoading: isLoading || (!spaceId && isLoadingPersonalSpace),
  };
}
