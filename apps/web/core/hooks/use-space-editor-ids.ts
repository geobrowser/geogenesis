'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { type SpaceRoles, getSpaceRoles, normalizeSpaceId } from '~/core/access/space-access';

const EMPTY_ROLE_SPACE_IDS = new Set<string>();
const EMPTY_SPACE_ROLES: SpaceRoles = { editorSpaceIds: EMPTY_ROLE_SPACE_IDS, memberSpaceIds: EMPTY_ROLE_SPACE_IDS };

/**
 * Which of `memberSpaceIds` are editors of the space, and which are members.
 *
 * Both roles come from one request, so they arrive together — a caller that draws something about a
 * person's standing cannot show half of it. `isError` is reported rather than folded into the empty
 * sets, because a failed lookup and a space where nobody holds a role are not the same answer, and a
 * caller that cannot tell them apart will state the second when it means the first.
 */
export function useSpaceRoles(spaceId: string, memberSpaceIds: string[]) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedMemberSpaceIds = [...new Set(memberSpaceIds.map(normalizeSpaceId))].sort();

  const {
    data = EMPTY_SPACE_ROLES,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['space-roles', normalizedSpaceId, normalizedMemberSpaceIds],
    queryFn: ({ signal }) => Effect.runPromise(getSpaceRoles(normalizedSpaceId, normalizedMemberSpaceIds, signal)),
    enabled: Boolean(normalizedSpaceId && normalizedMemberSpaceIds.length > 0),
  });

  return { ...data, isLoading, isError };
}

/** The editors half, for callers that only ask about editorship. */
export function useSpaceEditorIds(spaceId: string, memberSpaceIds: string[]) {
  const { editorSpaceIds, isLoading, isError } = useSpaceRoles(spaceId, memberSpaceIds);

  return { editorSpaceIds, isLoading, isError };
}
