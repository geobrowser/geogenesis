'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchActiveSubspaces } from '~/core/io/subgraph/fetch-active-subspaces';

export function useActiveSubspaces(spaceId: string, enabled = true) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['active-subspaces', spaceId],
    queryFn: () => fetchActiveSubspaces(spaceId),
    enabled: Boolean(spaceId) && enabled,
  });

  return {
    data: data ?? [],
    isLoading,
    isError,
    error,
  };
}
