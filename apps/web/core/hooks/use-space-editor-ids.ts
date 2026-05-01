'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEditorSpaceIdsForSpace } from '~/core/access/space-access';

export function useSpaceEditorIds(spaceId: string, memberSpaceIds: string[]) {
  const normalizedMemberSpaceIds = [...new Set(memberSpaceIds.map(id => id.toLowerCase()))].sort();

  const { data: editorSpaceIds = new Set<string>(), isLoading } = useQuery({
    queryKey: ['space-editor-ids', spaceId, normalizedMemberSpaceIds],
    queryFn: ({ signal }) => Effect.runPromise(getEditorSpaceIdsForSpace(spaceId, normalizedMemberSpaceIds, signal)),
    enabled: Boolean(spaceId && normalizedMemberSpaceIds.length > 0),
  });

  return {
    editorSpaceIds,
    isLoading,
  };
}
