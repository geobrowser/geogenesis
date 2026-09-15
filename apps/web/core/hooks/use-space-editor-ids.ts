'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getEditorSpaceIdsForSpace, getMemberSpaceIdsForSpace, normalizeSpaceId } from '~/core/access/space-access';

const EMPTY_ROLE_SPACE_IDS = new Set<string>();

/**
 * Which of `memberSpaceIds` hold `role` in the space. Both roles are asked the same way, so they
 * share one hook body — only the query key and the loader differ.
 */
function useSpaceRoleIds(role: 'editor' | 'member', spaceId: string, memberSpaceIds: string[], enabled = true) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedMemberSpaceIds = [...new Set(memberSpaceIds.map(normalizeSpaceId))].sort();
  const load = role === 'editor' ? getEditorSpaceIdsForSpace : getMemberSpaceIdsForSpace;

  const { data = EMPTY_ROLE_SPACE_IDS, isLoading } = useQuery({
    queryKey: [`space-${role}-ids`, normalizedSpaceId, normalizedMemberSpaceIds],
    queryFn: ({ signal }) => Effect.runPromise(load(normalizedSpaceId, normalizedMemberSpaceIds, signal)),
    enabled: enabled && Boolean(normalizedSpaceId && normalizedMemberSpaceIds.length > 0),
  });

  return { data, isLoading };
}

export function useSpaceEditorIds(spaceId: string, memberSpaceIds: string[]) {
  const { data, isLoading } = useSpaceRoleIds('editor', spaceId, memberSpaceIds);

  return {
    editorSpaceIds: data,
    isLoading,
  };
}

/**
 * `enabled` because, unlike editorship, nothing on a generic entity needs to know who is merely a
 * member — only a proposal's comment badges do (GEO-2907), and a lookup per comment author is not
 * worth paying on every other surface that renders comments.
 */
export function useSpaceMemberIds(spaceId: string, memberSpaceIds: string[], enabled = true) {
  const { data, isLoading } = useSpaceRoleIds('member', spaceId, memberSpaceIds, enabled);

  return {
    memberSpaceIds: data,
    isLoading,
  };
}
