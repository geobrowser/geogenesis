'use client';

import * as React from 'react';

import { useIsFastPathRestricted } from '~/core/hooks/use-fast-path-restricted';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpace } from '~/core/hooks/use-space';

export const ADD_BACK_PARAM = 'addBack';

/** Link an editor opens to add `personalSpaceId` back to `spaceId`. */
export function addBackLink(origin: string, spaceId: string, personalSpaceId: string) {
  const url = new URL(`/space/${spaceId}`, origin);
  url.searchParams.set(ADD_BACK_PARAM, personalSpaceId);
  return url.toString();
}

/**
 * Whether the signed-in viewer can't request to join `spaceId` on their own.
 *
 * Someone on the review path only who leaves a space keeps the restriction, and the DAO contract
 * refuses membership requests from a restricted space (`FastPathRestricted`). Only an editor's
 * proposal can add them back, so the Join control hands them a link to send an editor instead
 * of a request that can never go through.
 *
 * Callers only use this for non-members. It fails open like `useIsFastPathRestricted`: when the
 * read errors, the normal Join request is offered.
 */
export function useLockedOutOfSpace(spaceId: string) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { space } = useSpace(spaceId);
  const { isFastPathRestricted } = useIsFastPathRestricted(space?.address, personalSpaceId);
  const [copied, setCopied] = React.useState(false);

  const copyAddBackLink = React.useCallback(async () => {
    if (!personalSpaceId) return;
    try {
      await navigator.clipboard.writeText(addBackLink(window.location.origin, spaceId, personalSpaceId));
      setCopied(true);
    } catch (error) {
      console.error('Failed to copy add-back link', error);
    }
  }, [personalSpaceId, spaceId]);

  return { isLockedOut: Boolean(personalSpaceId) && isFastPathRestricted, copied, copyAddBackLink };
}
