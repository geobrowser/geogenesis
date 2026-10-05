'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyView,
  GeoChatRequestError,
  createDebateLobby,
  endDebateLobby,
  getDebateLobby,
  listDebateLobbies,
  sendDebateLobbyHeartbeat,
  setDebateLobbyPresence,
  setDebateLobbyReminder,
} from '../api';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useConnectionId } from '../rooms/hooks';
import { isAlreadyInAnotherLobby, otherLobbyIdFrom } from './lobby-format';

/** The lease is 45s server-side; three beats per lease survive one dropped request. */
export const LOBBY_HEARTBEAT_MS = 15_000;

/** The side panel list. No polling: `debate.lobbies_changed` refetches it. */
export function useDebateLobbies(enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobbies(accountKey),
    queryFn: ({ signal }) => listDebateLobbies(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
  });
}

/** Floor between refetches at `opens_at`, so a client clock ahead of the server cannot spin. */
const OPENS_REFETCH_MIN_MS = 5_000;
/** `setTimeout`'s ceiling; a later opening refetches early and schedules again. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * One lobby. Kept current by `debate.lobby_changed` and the heartbeat's own view. That event only
 * reaches present members, so a lobby not yet open is refetched at `opens_at`.
 */
export function useDebateLobby(lobbyId: string, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobby(accountKey, lobbyId),
    queryFn: ({ signal }) => getDebateLobby(lobbyId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(lobbyId) && ready && authenticated,
  });

  const access = query.data?.access;
  const opensAt = access?.status === 'not_yet_open' ? access.opens_at : null;
  const { refetch, dataUpdatedAt } = query;
  React.useEffect(() => {
    if (!opensAt) return;
    const at = Date.parse(opensAt);
    if (Number.isNaN(at)) return;
    const delay = Math.min(Math.max(at - Date.now() + 1_000, OPENS_REFETCH_MIN_MS), MAX_TIMEOUT_MS);
    const timeout = setTimeout(() => void refetch(), delay);
    return () => clearTimeout(timeout);
    // `dataUpdatedAt` reschedules after a refetch that still says not yet open.
  }, [dataUpdatedAt, opensAt, refetch]);

  return query;
}

/** Writes a returned view into the lobby's cache entry and marks the list stale. */
function useStoreLobbyView() {
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();

  return React.useCallback(
    (view: DebateLobbyView) => {
      queryClient.setQueryData(debateQueryKeys.lobby(accountKey, view.lobby_id), view);
      void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbies(accountKey) });
    },
    [accountKey, queryClient]
  );
}

export function useCreateDebateLobby() {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: (body: { name: string; starts_at?: string }) =>
      createDebateLobby(body, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

export function useDebateLobbyReminder() {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: ({ lobbyId, reminded }: { lobbyId: string; reminded: boolean }) =>
      setDebateLobbyReminder(lobbyId, reminded, getPrivyIdentityToken, accountKey),
    onSuccess: store,
    // Too late to set: the lobby opened or ended since the list was read.
    onError: error => {
      if (error instanceof GeoChatRequestError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbies(accountKey) });
      }
    },
  });
}

export function useEndDebateLobby(lobbyId: string) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();

  return useMutation({
    mutationFn: () => endDebateLobby(lobbyId, getPrivyIdentityToken, accountKey),
    onSuccess: store,
  });
}

export type LobbyPresenceState =
  | { status: 'idle' }
  | { status: 'joining' }
  | { status: 'joined' }
  /** Present in another open lobby; joining this one leaves it, so the viewer is asked first. */
  | { status: 'confirm_leave_other'; otherLobbyId: string | null }
  | { status: 'left' }
  | { status: 'failed'; message: string };

/**
 * Presence in one lobby: joins once admitted, heartbeats while joined, and leaves on unmount,
 * `pagehide` or Leave. A lapsed lease (viewer not present in a heartbeat's view) joins again.
 */
export function useLobbyPresence(lobbyId: string, admitted: boolean) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();
  const connectionId = useConnectionId();
  const [state, setState] = React.useState<LobbyPresenceState>({ status: 'idle' });

  // A token refresh must not re-run the effects below.
  const tokenRef = React.useRef(getPrivyIdentityToken);
  React.useEffect(() => {
    tokenRef.current = getPrivyIdentityToken;
  }, [getPrivyIdentityToken]);

  // Joined per the last answer; drives the heartbeat.
  const joinedRef = React.useRef(false);
  // A join was sent and no leave since, so leaving must be sent even if the join is in flight.
  const sentRef = React.useRef(false);
  // Bumped by Leave and unmount; a join answered under an older generation is dropped.
  const generationRef = React.useRef(0);
  // Presence requests in order, so a leave never lands before the join it follows.
  const queueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = React.useCallback(<T>(task: () => Promise<T>) => {
    const next = queueRef.current.catch(() => undefined).then(task);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const join = React.useCallback(
    async (leaveOtherLobby = false) => {
      const generation = generationRef.current;
      sentRef.current = true;
      setState({ status: 'joining' });
      try {
        const view = await enqueue(() =>
          setDebateLobbyPresence(
            lobbyId,
            { connection_id: connectionId, joined: true, leave_other_lobby: leaveOtherLobby },
            () => tokenRef.current(),
            accountKey
          )
        );
        if (generation !== generationRef.current) return;
        store(view);
        // A lobby that would not admit answers with its view; the page renders its access.
        joinedRef.current = view.viewer.present;
        setState(view.viewer.present ? { status: 'joined' } : { status: 'idle' });
      } catch (error) {
        if (generation !== generationRef.current) return;
        joinedRef.current = false;
        sentRef.current = false;
        if (isAlreadyInAnotherLobby(error)) {
          setState({ status: 'confirm_leave_other', otherLobbyId: otherLobbyIdFrom(error) });
          return;
        }
        setState({
          status: 'failed',
          message: error instanceof GeoChatRequestError ? error.message : 'Could not join this lobby.',
        });
      }
    },
    [accountKey, connectionId, enqueue, lobbyId, store]
  );

  const sendLeave = React.useCallback(
    (keepalive: boolean) =>
      setDebateLobbyPresence(
        lobbyId,
        { connection_id: connectionId, joined: false },
        () => tokenRef.current(),
        accountKey,
        keepalive
      ),
    [accountKey, connectionId, lobbyId]
  );

  const leave = React.useCallback(async () => {
    generationRef.current += 1;
    sentRef.current = false;
    joinedRef.current = false;
    setState({ status: 'left' });
    try {
      store(await enqueue(() => sendLeave(false)));
    } catch {
      // The lease lapses within a minute anyway.
    }
  }, [enqueue, sendLeave, store]);

  // Auto-join once admitted, unless the viewer left or is being asked about another lobby.
  const status = state.status;
  React.useEffect(() => {
    if (admitted && status === 'idle') void join(false);
  }, [admitted, join, status]);

  // Heartbeat while joined. A view without the viewer means the lease lapsed: join again.
  React.useEffect(() => {
    if (status !== 'joined' || !admitted) return;
    const interval = setInterval(() => {
      void sendDebateLobbyHeartbeat(
        lobbyId,
        { connection_id: connectionId, voice_connected: false },
        () => tokenRef.current(),
        accountKey
      )
        .then(view => {
          store(view);
          if (!joinedRef.current) return;
          if (view.access.status !== 'admitted') {
            joinedRef.current = false;
            setState({ status: 'idle' });
          } else if (!view.viewer.present) {
            void join(false);
          }
        })
        .catch(() => undefined);
    }, LOBBY_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [accountKey, admitted, connectionId, join, lobbyId, status, store]);

  // Leave on navigation away and on tab close. A bfcache restore joins again. Callbacks are read
  // through refs so a changed identity never runs the cleanup, which would send a leave.
  const joinRef = React.useRef(join);
  const sendLeaveRef = React.useRef(sendLeave);
  React.useEffect(() => {
    joinRef.current = join;
    sendLeaveRef.current = sendLeave;
  }, [join, sendLeave]);

  React.useEffect(() => {
    const queue = enqueue;
    const depart = () => {
      if (!sentRef.current) return;
      void sendLeaveRef.current(true).catch(() => undefined);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && sentRef.current) void joinRef.current(false);
    };
    window.addEventListener('pagehide', depart);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', depart);
      window.removeEventListener('pageshow', restore);
      generationRef.current += 1;
      joinedRef.current = false;
      if (sentRef.current) {
        sentRef.current = false;
        void queue(() => sendLeaveRef.current(true)).catch(() => undefined);
      }
      // Ignored after a real unmount; after StrictMode's test unmount it lets the remount join.
      setState({ status: 'idle' });
    };
  }, [enqueue]);

  return { state, join, leave };
}
