'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';

export function useSubtopics(spaceId: string) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subtopics', spaceId],
    queryFn: () => fetchSubtopics(spaceId),
    enabled: Boolean(spaceId),
  });

  return {
    data: data ?? [],
    isLoading,
    isError,
    error,
  };
}
