'use client';

import { useQueries } from '@tanstack/react-query';

import { normId } from '~/core/utils/norm-id';

import { type DebateLobbyClaim, LOBBY_CLAIMS_MAX_IDS, dashlessId, getDebateLobbyClaims } from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { viewerReadRetryOptions } from '../matchmaking/hooks';
import { useIsLobbyGuest } from './lobby-guest-hooks';

/**
 * The claims on screen as read batches: in list order, so a new page leaves earlier batches and their
 * cache keys alone, each sorted so its key doesn't depend on order.
 */
export function exploreRoomClaimBatches(entries: readonly { claim: { claim_entity_id: string } }[]): string[][] {
  const ids = [...new Set(entries.map(entry => normId(entry.claim.claim_entity_id)))];
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += LOBBY_CLAIMS_MAX_IDS) {
    batches.push(ids.slice(start, start + LOBBY_CLAIMS_MAX_IDS).sort());
  }
  return batches;
}

/**
 * The room's sides for the claims on screen, by `claimRowKey`; no entry means nobody in the room holds
 * a side. Keyed under "In this room", so its refetches cover these. Members only.
 */
export function useLobbyExploreRoomClaims(lobbyId: string, batches: string[][]) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const guest = useIsLobbyGuest();
  const enabled = !guest && Boolean(lobbyId) && ready && authenticated;

  return useQueries({
    queries: batches.map(ids => ({
      ...debateQueryNetworkOptions,
      ...viewerReadRetryOptions(accountKey),
      queryKey: [...debateQueryKeys.lobbyClaims(accountKey, lobbyId), 'explore', ids.join(',')] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getDebateLobbyClaims(dashlessId(lobbyId), getPrivyIdentityToken, accountKey, signal, ids),
      enabled,
    })),
    combine: combineRoomRows,
  });
}

// Module-level so react-query keeps the combined map until a batch's data changes.
function combineRoomRows(results: readonly { data?: { claims: DebateLobbyClaim[] } }[]) {
  return roomRowsByClaim(results.map(result => result.data?.claims));
}

export function roomRowsByClaim(batches: readonly (DebateLobbyClaim[] | undefined)[]) {
  const rows = new Map<string, DebateLobbyClaim>();
  for (const claims of batches) for (const row of claims ?? []) rows.set(claimRowKey(row), row);
  return rows;
}
