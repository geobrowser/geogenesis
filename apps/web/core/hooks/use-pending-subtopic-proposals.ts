'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchPendingSubtopicProposals } from '~/core/io/subgraph/fetch-pending-subtopic-proposals';

export function usePendingSubtopicProposals(spaceId: string, enabled = true) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pending-subtopic-proposals', spaceId],
    queryFn: () => fetchPendingSubtopicProposals(spaceId),
    enabled: Boolean(spaceId) && enabled,
  });

  return {
    data: data ?? [],
    isLoading,
    isError,
    error,
  };
}
