'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchPendingSubspaceProposals } from '~/core/io/subgraph/fetch-pending-subspace-proposals';

export function usePendingSubspaceProposals(spaceId: string, enabled = true) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pending-subspace-proposals', spaceId],
    queryFn: () => fetchPendingSubspaceProposals(spaceId),
    enabled: Boolean(spaceId) && enabled,
  });

  return {
    data: data ?? [],
    isLoading,
    isError,
    error,
  };
}
