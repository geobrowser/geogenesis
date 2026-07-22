'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { fetchSubtopicChildren } from '~/core/io/subgraph/fetch-subtopic-children';

const SUBTOPIC_CHILDREN_STALE_TIME = 30_000;

function subtopicChildrenQueryOptions(parentEntityId: string, spaceId: string) {
  return {
    queryKey: ['subtopic-children', spaceId, parentEntityId] as const,
    queryFn: () => fetchSubtopicChildren(parentEntityId, spaceId),
    staleTime: SUBTOPIC_CHILDREN_STALE_TIME,
  };
}

export function useSubtopicChildren(parentEntityId: string, spaceId: string, enabled: boolean) {
  return useQuery({
    ...subtopicChildrenQueryOptions(parentEntityId, spaceId),
    enabled: enabled && Boolean(parentEntityId) && Boolean(spaceId),
  });
}

export function usePrefetchSubtopicChildren() {
  const queryClient = useQueryClient();

  return React.useCallback(
    (parentEntityId: string, spaceId: string) => {
      if (!parentEntityId || !spaceId) return;
      void queryClient.prefetchQuery(subtopicChildrenQueryOptions(parentEntityId, spaceId));
    },
    [queryClient]
  );
}
