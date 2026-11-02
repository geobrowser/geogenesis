import type { DebateLobbyClaimList, DebateLobbyClaimLists, DebateLobbyView } from '../api';
import { isInstant, isNewerInstant } from './lobby-highlights-state';

/**
 * `debate.lobby_claim_lists_changed`'s `lobby_claim_lists`; `null` when unreadable. Only the parts
 * the page reads are checked.
 */
export function parseLobbyClaimLists(value: unknown): DebateLobbyClaimLists | null {
  if (!isRecord(value) || typeof value.lobby_id !== 'string') return null;
  if (value.as_of !== null && !isInstant(value.as_of)) return null;
  if (!Array.isArray(value.claim_lists) || !value.claim_lists.every(isClaimList)) return null;
  return value as DebateLobbyClaimLists;
}

/**
 * `view` with `incoming`'s lists when they are newer by `as_of`; `view` itself otherwise, so an
 * event that a host action's own response already applied changes nothing.
 */
export function withLobbyClaimLists<T extends Pick<DebateLobbyView, 'claim_lists' | 'claim_lists_as_of'>>(
  view: T,
  incoming: DebateLobbyClaimLists
): T {
  if (!isNewerInstant(incoming.as_of, view.claim_lists_as_of ?? null)) return view;
  return { ...view, claim_lists: incoming.claim_lists, claim_lists_as_of: incoming.as_of };
}

/**
 * A lobby GET's view, keeping the cached lists when an event or a host action laid newer ones over
 * the cache while the GET was in flight.
 */
export function settleFetchedLobbyClaimLists<T extends Pick<DebateLobbyView, 'claim_lists' | 'claim_lists_as_of'>>(
  cached: T | undefined,
  fetched: T
): T {
  if (!cached || !isNewerInstant(cached.claim_lists_as_of ?? null, fetched.claim_lists_as_of ?? null)) return fetched;
  return { ...fetched, claim_lists: cached.claim_lists, claim_lists_as_of: cached.claim_lists_as_of };
}

/** The lobby's lists in tab order. geo-chat sends them ordered; sorted again so a tab never jumps. */
export function orderedClaimLists(view: Pick<DebateLobbyView, 'claim_lists'>): DebateLobbyClaimList[] {
  return [...(view.claim_lists ?? [])].sort((a, z) => a.position - z.position);
}

function isClaimList(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.entity_id === 'string' &&
    typeof value.space_id === 'string' &&
    typeof value.position === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
