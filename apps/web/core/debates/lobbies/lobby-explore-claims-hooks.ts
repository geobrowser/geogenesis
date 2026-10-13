'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyClaim,
  type DebateLobbyClaims,
  LOBBY_CLAIMS_MAX_IDS,
  dashlessId,
  geoChatClaimId,
  getDebateLobbyClaims,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { claimRowKey } from '../matchmaking/claim-row-key';
import { viewerReadRetryOptions } from '../matchmaking/hooks';
import { useIsLobbyGuest } from './lobby-guest-hooks';

/**
 * The claims on screen as read batches: in list order, so a new page leaves earlier batches and their
 * cache keys alone, each sorted so its key doesn't depend on order.
 */
export function exploreRoomClaimBatches(entries: readonly { claim: { claim_entity_id: string } }[]): string[][] {
  const ids = [...new Set(entries.map(entry => geoChatClaimId(entry.claim.claim_entity_id)))];
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += LOBBY_CLAIMS_MAX_IDS) {
    batches.push(ids.slice(start, start + LOBBY_CLAIMS_MAX_IDS).sort());
  }
  return batches;
}

/**
 * The batches holding a claim near the viewport, so the reads stay a screen or two deep however far
 * the list is scrolled. `onNear` takes a claim entity id as a card enters or leaves range.
 */
export function useNearExploreBatches(batches: string[][]) {
  // Counted per card: one claim tagged in two spaces is two cards with one id.
  const nearRef = React.useRef(new Map<string, number>());
  const [activeKey, setActiveKey] = React.useState('');

  const sync = React.useCallback(() => setActiveKey(nearBatchIndexes(batches, nearRef.current).join(',')), [batches]);
  React.useEffect(sync, [sync]);

  const onNear = React.useCallback(
    (claimEntityId: string, isNear: boolean) => {
      const near = nearRef.current;
      const id = geoChatClaimId(claimEntityId);
      const count = (near.get(id) ?? 0) + (isNear ? 1 : -1);
      if (count > 0) near.set(id, count);
      else near.delete(id);
      sync();
    },
    [sync]
  );

  const active = React.useMemo(
    () =>
      activeKey === ''
        ? []
        : activeKey.split(',').flatMap(index => {
            const batch = batches[Number(index)];
            return batch ? [batch] : [];
          }),
    [activeKey, batches]
  );
  return { active, onNear };
}

export function nearBatchIndexes(batches: string[][], near: { has(id: string): boolean }) {
  return batches.flatMap((batch, index) => (batch.some(id => near.has(id)) ? [index] : []));
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
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        namedRoomClaims(
          await getDebateLobbyClaims(dashlessId(lobbyId), getPrivyIdentityToken, accountKey, signal, ids),
          ids
        ),
      enabled,
    })),
    combine: combineRoomRows,
  });
}

// Module-level so react-query keeps the combined map until a batch's data changes.
function combineRoomRows(results: readonly { data?: { claims: DebateLobbyClaim[] } }[]) {
  return roomRowsByClaim(results.map(result => result.data?.claims));
}

/**
 * Only the claims the batch named, and nothing from a `recent` list: a geo-chat without the filter
 * answers with the unfiltered "In this room" list instead.
 */
export function namedRoomClaims(response: DebateLobbyClaims, ids: readonly string[]): DebateLobbyClaims {
  if (response.source !== 'room') return { ...response, claims: [] };
  const named = new Set(ids);
  return { ...response, claims: response.claims.filter(row => named.has(geoChatClaimId(row.claim.claim_entity_id))) };
}

export function roomRowsByClaim(batches: readonly (DebateLobbyClaim[] | undefined)[]) {
  const rows = new Map<string, DebateLobbyClaim>();
  for (const claims of batches) for (const row of claims ?? []) rows.set(claimRowKey(row), row);
  return rows;
}
