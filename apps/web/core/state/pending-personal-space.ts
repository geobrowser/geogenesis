'use client';

import { useAtomValue } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/**
 * Optimistic personal-space creation state.
 *
 * When a brand-new user finishes onboarding we don't block on the (30s–3min)
 * `createPersonalSpace` chain. Instead we mark the account "pending" and let
 * them keep working. Local edits made during the window are buffered under a
 * `pending:<topicId>` sentinel spaceId and remapped to the real spaceId on
 * resolve (see `GeoStore.remapSpaceId`). Persisted so a reload resumes the
 * background job instead of restarting onboarding.
 */
export const PENDING_PERSONAL_SPACE_PREFIX = 'pending:';

export type PendingPersonalSpace = {
  /** Pre-generated person/profile entity id — also the on-chain topic id. */
  topicId: string;
  status: 'pending' | 'failed';
};

// getOnInit so the value is read from localStorage synchronously on the first
// client render — the pending page redirects itself when not pending, and we
// don't want a flash of "not pending" to bounce the user away before hydration.
export const pendingPersonalSpaceAtom = atomWithStorage<PendingPersonalSpace | null>(
  'pendingPersonalSpace',
  null,
  undefined,
  {
    getOnInit: true,
  }
);

export function pendingPersonalSpaceId(topicId: string): string {
  return `${PENDING_PERSONAL_SPACE_PREFIX}${topicId}`;
}

export function isPendingPersonalSpaceId(spaceId: string | null | undefined): spaceId is string {
  return typeof spaceId === 'string' && spaceId.startsWith(PENDING_PERSONAL_SPACE_PREFIX);
}

export function usePendingPersonalSpace() {
  const pending = useAtomValue(pendingPersonalSpaceAtom);
  return {
    isPending: pending?.status === 'pending',
    topicId: pending?.topicId ?? null,
  };
}
