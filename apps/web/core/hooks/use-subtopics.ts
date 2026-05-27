'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';
import { Spaces } from '~/core/utils/space';

import { useSpace } from './use-space';

export function useSubtopics(spaceId: string) {
  const { space, isLoading: isSpaceLoading } = useSpace(spaceId);
  const rootEntityId = space ? Spaces.getSpaceSubtopicRootEntityId(space) : '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['subtopics', spaceId, rootEntityId],
    queryFn: () => fetchSubtopics(spaceId, rootEntityId),
    enabled: Boolean(spaceId) && Boolean(rootEntityId),
  });

  return {
    data: data ?? [],
    isLoading: isSpaceLoading || isLoading,
    isError,
    error,
    rootEntityId,
    space,
  };
}
