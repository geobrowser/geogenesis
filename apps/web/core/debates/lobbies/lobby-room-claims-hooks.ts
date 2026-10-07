'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { GeoChatRequestError, dashlessId, getDebateLobbyClaims } from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';

/**
 * The lobby's "In this room" claims. Refetched on `debate.lobby_changed`, after the viewer's own vote
 * is reported, and on reconnect, so no polling.
 */
export function useDebateLobbyClaims(lobbyId: string, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId),
    queryFn: ({ signal }) => getDebateLobbyClaims(dashlessId(lobbyId), getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(lobbyId) && ready && authenticated,
  });
}

/** Refusals that mean the list's request offer is out of date. */
const STALE_OFFER_CODES = new Set(['no_candidates_in_lobby', 'lobby_not_present']);

/** A request `onError` that refetches the list when the refusal says its offer was stale. */
export function useRefreshLobbyClaimsOnRefusal(lobbyId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return (error: unknown) => {
    if (!(error instanceof GeoChatRequestError) || !error.code || !STALE_OFFER_CODES.has(error.code)) return;
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId) });
  };
}

/** A refused lobby-scoped request, in the reader's terms; null to fall back to the claim's own. */
export function lobbyClaimRequestErrorMessage(error: unknown) {
  if (!(error instanceof GeoChatRequestError)) return null;
  switch (error.code) {
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
