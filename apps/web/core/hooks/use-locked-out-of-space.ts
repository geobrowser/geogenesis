'use client';

import { useIsFastPathRestricted } from '~/core/hooks/use-fast-path-restricted';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';
import { NavUtils } from '~/core/utils/utils';

export const ADD_BACK_PARAM = 'addBack';

/** Link an editor opens to add `personalSpaceId` back to `spaceId`. */
export function addBackLink(origin: string, spaceId: string, personalSpaceId: string) {
  const url = new URL(NavUtils.toSpace(spaceId), origin);
  url.searchParams.set(ADD_BACK_PARAM, personalSpaceId);
  return url.toString();
}

/**
 * Whether the signed-in viewer can't request to join `spaceId` on their own, and the link to send
 * an editor if so.
 *
 * Someone on the review path only keeps the restriction after leaving, and the DAO contract refuses
 * membership requests from a restricted space (`FastPathRestricted`). Only an editor's proposal can
 * add them, so Join hands them that link instead of a request that can never go through.
 *
 * Callers only use this for non-members. It fails open like `useIsFastPathRestricted`: when the
 * read errors, the normal Join request is offered.
 */
export function useLockedOutOfSpace(spaceId: string) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { space } = useSpace(spaceId);
  const { isFastPathRestricted } = useIsFastPathRestricted(space?.address, personalSpaceId);

  if (!personalSpaceId || !isFastPathRestricted) return { isLockedOut: false as const };
  return {
    isLockedOut: true as const,
    link: typeof window === 'undefined' ? '' : addBackLink(window.location.origin, spaceId, personalSpaceId),
  };
}
