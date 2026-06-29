import { atomWithStorage } from 'jotai/utils';

import { normId } from '~/core/utils/norm-id';

export type RequestedMembershipSpace = {
  id: string;
  /** Personal space id of the requester — scopes the entry so it never leaks across accounts. */
  ownerId: string;
  /** Optional display data; absent when the request originates somewhere without it (e.g. a space page). */
  name?: string;
  image?: string | null;
};

const STORAGE_KEY = 'geo:requested-membership-spaces';

/**
 * Spaces the user has requested membership for, persisted to localStorage so the
 * optimistic "Membership pending" state survives a refresh while the indexer
 * catches up. This is only a bridge — {@link fetchPendingMembershipSpaceIds} is
 * the durable source of truth, and reconciliation drops entries once the server
 * reports the membership (pending or granted).
 *
 * Each entry carries its `ownerId` (the requester's personal space id); readers
 * MUST filter by the current personal space id via {@link requestedSpacesForOwner}
 * so a signed-out user — or the next account in the same browser — never inherits
 * a prior user's optimistic pending state.
 *
 * Stored as an array (Maps don't serialize to JSON). Helpers below keep callers
 * from hand-rolling the normId dedup.
 */
export const requestedMembershipSpacesAtom = atomWithStorage<RequestedMembershipSpace[]>(STORAGE_KEY, []);

export function upsertRequestedMembershipSpace(
  current: RequestedMembershipSpace[],
  space: RequestedMembershipSpace
): RequestedMembershipSpace[] {
  const key = normId(space.id);
  if (current.some(s => normId(s.id) === key && s.ownerId === space.ownerId)) return current;
  return [...current, space];
}

/** Entries owned by the given personal space id. Empty when signed out (no owner). */
export function requestedSpacesForOwner(
  current: RequestedMembershipSpace[],
  ownerId: string | null | undefined
): RequestedMembershipSpace[] {
  if (!ownerId) return [];
  return current.filter(s => s.ownerId === ownerId);
}

export function requestedMembershipIdSet(current: RequestedMembershipSpace[]): Set<string> {
  return new Set(current.map(s => normId(s.id)));
}
