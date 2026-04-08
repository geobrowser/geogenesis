'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchSpaceTopic } from '~/core/io/subgraph/fetch-space-topic';

export function useSpaceTopicPanel(spaceId: string, enabled = true) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['space-topic', spaceId],
    queryFn: () => fetchSpaceTopic(spaceId),
    enabled: enabled && Boolean(spaceId),
  });

  return {
    data: data ?? null,
    isLoading,
    isError,
    error,
  };
}
