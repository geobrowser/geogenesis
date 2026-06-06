'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchSubtopicChildren } from '~/core/io/subgraph/fetch-subtopic-children';

export function useSubtopicChildren(parentEntityId: string, spaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['subtopic-children', spaceId, parentEntityId],
    queryFn: () => fetchSubtopicChildren(parentEntityId, spaceId),
    enabled: enabled && Boolean(parentEntityId) && Boolean(spaceId),
    staleTime: 30_000,
  });
}
