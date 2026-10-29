'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { type SpaceRoles, getSpaceRoles, normalizeSpaceId } from '~/core/access/space-access';
import { validateSpaceId } from '~/core/io/rest/validation';

const EMPTY_ROLE_SPACE_IDS = new Set<string>();
const EMPTY_SPACE_ROLES: SpaceRoles = { editorSpaceIds: EMPTY_ROLE_SPACE_IDS, memberSpaceIds: EMPTY_ROLE_SPACE_IDS };

/**
 * The roles lookup for one space and a set of people, for `useQuery` or `useQueries`. Shared so every
 * caller asking the same question lands on the same cache entry (GEO-3489's agenda ordering asks it
 * per agenda space).
 */
export function spaceRolesQueryOptions(spaceId: string, memberSpaceIds: string[]) {
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  // Filtered here as well as at the loader, so the key says who is actually being asked about. A
  // comment mid-publish carries `pending:<wallet>` for its author's space, and leaving that in the key
  // would mint a fresh cache entry for the same question and then discard it seconds later.
  const normalizedMemberSpaceIds = [...new Set(memberSpaceIds.map(validateSpaceId).filter(id => id !== null))].sort();

  return {
    queryKey: ['space-roles', normalizedSpaceId, normalizedMemberSpaceIds] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      Effect.runPromise(getSpaceRoles(normalizedSpaceId, normalizedMemberSpaceIds, signal)),
    enabled: Boolean(normalizedSpaceId && normalizedMemberSpaceIds.length > 0),
  };
}

/**
 * Which of `memberSpaceIds` are editors of the space, and which are members.
 *
 * Both roles come from one request, so they arrive together — a caller that draws something about a
 * person's standing cannot show half of it. `isError` is reported rather than folded into the empty
 * sets, because a failed lookup and a space where nobody holds a role are not the same answer, and a
 * caller that cannot tell them apart will state the second when it means the first.
 */
export function useSpaceRoles(spaceId: string, memberSpaceIds: string[]) {
  const {
    data = EMPTY_SPACE_ROLES,
    isLoading,
    isError,
  } = useQuery({
    ...spaceRolesQueryOptions(spaceId, memberSpaceIds),
    // The key holds the people being asked about, so publishing a comment mints a new one — and without
    // this, `isLoading` flips back to true and every badge in the thread blanks and returns. That is the
    // "page correcting itself about a person" flicker the caller's hold exists to prevent, triggered by
    // the ordinary act of commenting. The previous answer stays up instead; the new author simply has no
    // badge until their roles land, which is the honest state for someone just asked about.
    placeholderData: keepPreviousData,
  });

  return { ...data, isLoading, isError };
}
