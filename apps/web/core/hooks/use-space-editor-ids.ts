'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEditorSpaceIdsForSpace, normalizeSpaceId } from '~/core/access/space-access';

const EMPTY_EDITOR_SPACE_IDS = new Set<string>();

export function useSpaceEditorIds(spaceId: string, memberSpaceIds: string[]) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedMemberSpaceIds = [...new Set(memberSpaceIds.map(normalizeSpaceId))].sort();

  const { data: editorSpaceIds = EMPTY_EDITOR_SPACE_IDS, isLoading } = useQuery({
    queryKey: ['space-editor-ids', normalizedSpaceId, normalizedMemberSpaceIds],
    queryFn: ({ signal }) =>
      Effect.runPromise(getEditorSpaceIdsForSpace(normalizedSpaceId, normalizedMemberSpaceIds, signal)),
    enabled: Boolean(normalizedSpaceId && normalizedMemberSpaceIds.length > 0),
  });

  return {
    editorSpaceIds,
    isLoading,
  };
}
