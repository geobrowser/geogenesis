import { atomWithStorage } from 'jotai/utils';

import { normId } from '~/core/utils/norm-id';

export type RequestedMembershipSpace = {
  id: string;
  /** Personal space id of the requester — scopes the entry so it never leaks across accounts. */
  ownerId: string;
  /** Epoch ms when the request was made — the bridge is ignored past {@link REQUEST_BRIDGE_TTL_MS}. */
  requestedAt: number;
  /** Optional display data; absent when the request originates somewhere without it (e.g. a space page). */
  name?: string;
  image?: string | null;
};

const STORAGE_KEY = 'geo:requested-membership-spaces';

/**
 * How long an optimistic entry is trusted. The bridge only needs to cover the
 * gap between a successful request tx and the indexer reporting the proposal
 * (seconds). Past this window the durable server query is authoritative, so an
 * entry the server no longer reports as pending (e.g. the request was rejected
 * or its vote ended) stops showing as "Membership pending" instead of lingering
 * forever.
 */
export const REQUEST_BRIDGE_TTL_MS = 5 * 60_000;

/**
 * Spaces the user has requested membership for, persisted to localStorage so the
 * optimistic "Membership pending" state survives a refresh while the indexer
 * catches up. This is only a bridge — {@link fetchPendingMembershipSpaceIds} is
 * the durable source of truth.
 *
 * Reads MUST go through {@link activeRequestedSpacesForOwner} so entries are
 * scoped to the current account (never leak across sign-out / account switch)
 * and expired entries drop out.
 *
 * Stored as an array (Maps don't serialize to JSON).
 */
export const requestedMembershipSpacesAtom = atomWithStorage<RequestedMembershipSpace[]>(STORAGE_KEY, []);

/** Insert a new entry, or merge newly-available display data into an existing one for the same owner+space. */
export function upsertRequestedMembershipSpace(
  current: RequestedMembershipSpace[],
  space: RequestedMembershipSpace
): RequestedMembershipSpace[] {
  const key = normId(space.id);
  const index = current.findIndex(s => normId(s.id) === key && s.ownerId === space.ownerId);
  if (index === -1) return [...current, space];

  const existing = current[index];
  const merged: RequestedMembershipSpace = {
    ...existing,
    requestedAt: space.requestedAt,
    name: space.name ?? existing.name,
    image: space.image ?? existing.image,
  };
  const next = [...current];
  next[index] = merged;
  return next;
}

/** This account's still-active (non-expired) optimistic entries. Empty when signed out. */
export function activeRequestedSpacesForOwner(
  current: RequestedMembershipSpace[],
  ownerId: string | null | undefined,
  now: number
): RequestedMembershipSpace[] {
  if (!ownerId) return [];
  return current.filter(s => s.ownerId === ownerId && now - s.requestedAt < REQUEST_BRIDGE_TTL_MS);
}

/** Drop entries that are expired, or belong to `ownerId` and are now server-tracked. Returns `current` if unchanged. */
export function reconcileRequestedSpaces(
  current: RequestedMembershipSpace[],
  ownerId: string | null | undefined,
  serverTrackedIds: Set<string>,
  now: number
): RequestedMembershipSpace[] {
  const next = current.filter(s => {
    if (now - s.requestedAt >= REQUEST_BRIDGE_TTL_MS) return false;
    if (ownerId && s.ownerId === ownerId && serverTrackedIds.has(normId(s.id))) return false;
    return true;
  });
  return next.length === current.length ? current : next;
}

export function requestedMembershipIdSet(current: RequestedMembershipSpace[]): Set<string> {
  return new Set(current.map(s => normId(s.id)));
}
