'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  type DebateLobbyClaimLists,
  type DebateLobbyView,
  dashlessId,
  removeDebateLobbyClaimList,
  saveDebateLobbyClaimList,
} from '../api';
import { debateQueryKeys, useGeoChatAuth } from '../hooks';
import { withLobbyClaimLists } from './lobby-claim-lists-state';

/** Lays a host action's returned lists over the cached view when newer. The event may beat it. */
function useStoreLobbyClaimLists(lobbyId: string) {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  return (state: DebateLobbyClaimLists) =>
    queryClient.setQueryData<DebateLobbyView>(debateQueryKeys.lobby(accountKey, dashlessId(lobbyId)), current =>
      current ? withLobbyClaimLists(current, state) : current
    );
}

/**
 * Adds a claim list page, or moves one already on the lobby to `position`. Appends when `position`
 * is omitted. Host only.
 */
export function useSaveLobbyClaimList(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyClaimLists(lobbyId);

  return useMutation({
    mutationFn: ({ entityId, spaceId, position }: { entityId: string; spaceId: string; position?: number }) =>
      saveDebateLobbyClaimList(
        dashlessId(lobbyId),
        dashlessId(entityId),
        position === undefined ? { space_id: dashlessId(spaceId) } : { space_id: dashlessId(spaceId), position },
        getPrivyIdentityToken,
        accountKey
      ),
    onSuccess: store,
  });
}

/** Takes a claim list off the lobby for everyone. The page in Geo is untouched. Host only. */
export function useRemoveLobbyClaimList(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyClaimLists(lobbyId);

  return useMutation({
    mutationFn: (entityId: string) =>
      removeDebateLobbyClaimList(dashlessId(lobbyId), dashlessId(entityId), getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}
