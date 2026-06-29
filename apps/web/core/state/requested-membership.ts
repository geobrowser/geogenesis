import { atomWithStorage } from 'jotai/utils';

import { normId } from '~/core/utils/norm-id';

export type RequestedMembershipSpace = {
  id: string;
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
 * Stored as an array (Maps don't serialize to JSON). Helpers below keep callers
 * from hand-rolling the normId dedup.
 */
export const requestedMembershipSpacesAtom = atomWithStorage<RequestedMembershipSpace[]>(STORAGE_KEY, []);

export function upsertRequestedMembershipSpace(
  current: RequestedMembershipSpace[],
  space: RequestedMembershipSpace
): RequestedMembershipSpace[] {
  const key = normId(space.id);
  if (current.some(s => normId(s.id) === key)) return current;
  return [...current, space];
}

/** Drop any requested entries whose normalized id is in `normalizedIds` (e.g. the server now tracks them). */
export function pruneRequestedMembershipSpaces(
  current: RequestedMembershipSpace[],
  normalizedIds: Set<string>
): RequestedMembershipSpace[] {
  if (normalizedIds.size === 0) return current;
  const next = current.filter(s => !normalizedIds.has(normId(s.id)));
  return next.length === current.length ? current : next;
}

export function requestedMembershipIdSet(current: RequestedMembershipSpace[]): Set<string> {
  return new Set(current.map(s => normId(s.id)));
}
