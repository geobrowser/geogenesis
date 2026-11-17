'use client';

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyClaim,
  type DebateLobbyClaims,
  type DebateLobbyGuestView,
  GeoChatRequestError,
  dashlessId,
  getDebateLobbyClaims,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { viewerReadRetryOptions } from '../matchmaking/hooks';
import { roomClaimIdBatches, useNamedRoomClaimsQuery } from './lobby-explore-claims-hooks';
import { useDebateLobbyGuestView, useIsLobbyGuest } from './lobby-guest-hooks';

const guestClaims = (view: DebateLobbyGuestView) => view.claims ?? undefined;

/**
 * The lobby's "In this room" claims. Refetched on `debate.lobby_changed`, after the viewer's own vote
 * is reported, and on reconnect, so no polling. A failed read retries, since a quiet lobby sends none.
 */
export function useDebateLobbyClaims(lobbyId: string, enabled = true, claimIds?: readonly string[] | null) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  // A guest reads them off the page's guest view, which polls.
  const guest = useIsLobbyGuest();
  const guestQuery = useDebateLobbyGuestView(lobbyId, { enabled: enabled && guest, select: guestClaims });
  const named = Boolean(claimIds) && !guest;

  const memberQuery = useQuery({
    ...debateQueryNetworkOptions,
    ...viewerReadRetryOptions(accountKey),
    queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId),
    queryFn: ({ signal }) => getDebateLobbyClaims(dashlessId(lobbyId), getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && !guest && !named && Boolean(lobbyId) && ready && authenticated,
  });
  const namedQuery = useNamedLobbyClaims(lobbyId, claimIds ?? NO_IDS, enabled && named);

  return guest ? guestQuery : named ? namedQuery : memberQuery;
}

const NO_IDS: readonly string[] = [];

/**
 * GEO-3775. "In this room" for just `claimIds`, for a member: the unfiltered read stops at geo-chat's
 * 50 most split claims, so narrowing that would lose named claims ranked below them. Read in batches
 * of the filtered read, merged most split first as geo-chat orders them. A filtered read carries no
 * counts, so `disagreements` is empty for the caller to count from the rows (`agendaLobbyClaims`).
 */
function useNamedLobbyClaims(lobbyId: string, claimIds: readonly string[], enabled: boolean) {
  const { accountKey } = useGeoChatAuth();
  const queryClient = useQueryClient();
  const batches = React.useMemo(() => roomClaimIdBatches(claimIds), [claimIds]);
  const query = useNamedRoomClaimsQuery(lobbyId, NAMED_READ, enabled);
  const read = useQueries({ queries: batches.map(query), combine: combineNamedReads });

  const data = React.useMemo<DebateLobbyClaims | undefined>(
    () => read.claims && { lobby_id: dashlessId(lobbyId), source: 'room', claims: read.claims, disagreements: [] },
    [lobbyId, read.claims]
  );
  return {
    data,
    isLoading: read.isLoading,
    error: read.error,
    failureReason: read.failureReason,
    refetch: () =>
      queryClient.refetchQueries({ queryKey: [...debateQueryKeys.lobbyClaims(accountKey, lobbyId), NAMED_READ] }),
  };
}

const NAMED_READ = 'named';

// Module-level, and plain data only, so react-query keeps the combined result until a read changes.
function combineNamedReads(
  results: readonly { data?: DebateLobbyClaims; isLoading: boolean; error: unknown; failureReason: unknown }[]
) {
  const reads = results.flatMap(result => (result.data ? [result.data] : []));
  return {
    claims: reads.length === results.length ? mostSplitFirst(reads.flatMap(read => read.claims)) : undefined,
    isLoading: results.some(result => result.isLoading),
    error: results.find(result => result.error)?.error ?? null,
    failureReason: results.find(result => result.failureReason)?.failureReason ?? null,
  };
}

/** geo-chat's order for the room's claims: most disagreeing pairs, then most people. Stable. */
export function mostSplitFirst(claims: DebateLobbyClaim[]): DebateLobbyClaim[] {
  const sides = (row: DebateLobbyClaim) => row.positions.map(side => side.total_in_room);
  const pairs = (row: DebateLobbyClaim) => sides(row).reduce((product, total) => product * total, 1);
  const people = (row: DebateLobbyClaim) => sides(row).reduce((sum, total) => sum + total, 0);
  return [...claims].sort((a, b) => pairs(b) - pairs(a) || people(b) - people(a));
}

/** Refusals that mean the list's request offer is out of date. */
const STALE_OFFER_CODES = new Set(['no_candidates_in_lobby', 'lobby_not_present', 'recipient_not_available']);

/** A request `onError` that refetches the list when the refusal says its offer was stale. */
export function useRefreshLobbyClaimsOnRefusal(lobbyId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return (error: unknown) => {
    if (!(error instanceof GeoChatRequestError) || !error.code || !STALE_OFFER_CODES.has(error.code)) return;
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId) });
  };
}

export const RECIPIENT_UNAVAILABLE_MESSAGE = 'They can’t take a request on this claim right now.';

/** A refused lobby-scoped request, in the reader's terms; null to fall back to the claim's own. */
export function lobbyClaimRequestErrorMessage(error: unknown) {
  if (!(error instanceof GeoChatRequestError)) return null;
  switch (error.code) {
    case 'recipient_not_available':
      return RECIPIENT_UNAVAILABLE_MESSAGE;
    case 'no_candidates_in_lobby':
      return 'Nobody here on the other side can take a request right now.';
    case 'lobby_not_present':
      return 'You’re not in the lobby right now. Join it to send a request.';
    case 'lobby_closed':
      return 'This lobby has closed.';
    case 'lobby_banned':
      return 'You can’t send requests in this lobby.';
    case 'lobby_not_found':
      return 'This lobby no longer exists.';
    default:
      return null;
  }
}

/** Why geo-chat won't use the viewer's held side for a request, or null to wait it out. */
export function readinessDisabledMessage(reason: string | null) {
  switch (reason) {
    case null:
      return null;
    case 'claim_response_withdrawn':
    case 'claim_response_kind_changed':
      return 'Choose Agree or Disagree again to debate this claim.';
    default:
      return 'You can’t request a debate on this claim right now.';
  }
}
