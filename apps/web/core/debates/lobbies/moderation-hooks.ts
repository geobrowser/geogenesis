'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type DebateLobbyMemberAction,
  getDebateLobbyBans,
  getDebateLobbyModerationLog,
  moderateDebateLobbyMember,
  setDebateLobbyHand,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useStoreLobbyView } from './hooks';

/**
 * Under the lobby's key, so `debate.lobby_changed` (sent on ban, unban and every role change)
 * refetches them with the lobby.
 */
export const lobbyModerationKeys = {
  bans: (accountKey: string | null, lobbyId: string) =>
    [...debateQueryKeys.lobby(accountKey, lobbyId), 'bans'] as const,
  log: (accountKey: string | null, lobbyId: string) => [...debateQueryKeys.lobby(accountKey, lobbyId), 'log'] as const,
};

/** One host action on one member (GEO-3134). Stores the returned view. */
export function useModerateLobbyMember(lobbyId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: DebateLobbyMemberAction }) =>
      moderateDebateLobbyMember(lobbyId, userId, action, getPrivyIdentityToken, accountKey),
    onSuccess: view => {
      store(view);
      void queryClient.invalidateQueries({ queryKey: lobbyModerationKeys.bans(accountKey, lobbyId) });
      void queryClient.invalidateQueries({ queryKey: lobbyModerationKeys.log(accountKey, lobbyId) });
    },
  });
}

/** Raise or lower the viewer's own hand. */
export function useLobbyHand(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: (raised: boolean) => setDebateLobbyHand(lobbyId, raised, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

export function useLobbyBans(lobbyId: string, enabled: boolean) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: lobbyModerationKeys.bans(accountKey, lobbyId),
    queryFn: ({ signal }) => getDebateLobbyBans(lobbyId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
    select: data => data.banned,
  });
}

export function useLobbyModerationLog(lobbyId: string, enabled: boolean) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: lobbyModerationKeys.log(accountKey, lobbyId),
    queryFn: ({ signal }) => getDebateLobbyModerationLog(lobbyId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
    select: data => data.entries,
  });
}
