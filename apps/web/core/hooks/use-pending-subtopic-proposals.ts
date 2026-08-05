'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchPendingSubtopicProposals } from '~/core/io/subgraph/fetch-pending-subtopic-proposals';

export function usePendingSubtopicProposals(spaceId: string, rootEntityId: string, enabled = true) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pending-subtopic-proposals', spaceId, rootEntityId],
    queryFn: () => fetchPendingSubtopicProposals(spaceId, rootEntityId),
    enabled: Boolean(spaceId) && Boolean(rootEntityId) && enabled,
    staleTime: 30_000,
  });

  return {
    data: data ?? [],
    isLoading,
    isError,
    error,
  };
}
