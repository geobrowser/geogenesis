'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyHeartbeat,
  type DebateLobbyView,
  GeoChatRequestError,
  createDebateLobby,
  dashlessId,
  endDebateLobby,
  endDebateLobbyStepOut,
  getDebateLobby,
  getMyDebateLobby,
  listDebateLobbies,
  sendDebateLobbyHeartbeat,
  setDebateLobbyPresence,
  setDebateLobbyReminder,
  stepOutOfDebateLobby,
} from '../api';
import { rememberLobbyReturnDestination } from '../debate-return-navigation';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useConnectionId } from '../rooms/hooks';
import { isAlreadyInAnotherLobby, isRemovedFromLobby, lobbyErrorMessage, otherLobbyIdFrom } from './lobby-format';
import { clearLobbyRejoin, consumeLobbyRejoin, registerLobbyStepOut } from './step-out';

/** The lease is 120s server-side; a throttled background tab beating once a minute stays in. */
export const LOBBY_HEARTBEAT_MS = 15_000;
/** A tab turning visible beats only if this long has passed, to stay under 30 beats a minute. */
const VISIBLE_BEAT_MIN_GAP_MS = 30_000;
/** For a 429 without `Retry-After`. */
const RATE_LIMIT_FALLBACK_MS = 5_000;
/** How long a 429 asks us to wait, or `null` for any other outcome. */
export function rateLimitDelayMs(error: unknown) {
  if (!(error instanceof GeoChatRequestError) || error.status !== 429) return null;
  return error.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS;
}

/** Automatic presence calls retry once after a 429's `Retry-After`, per geo-chat's guidance. */
async function retryOnceIfRateLimited<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const delay = rateLimitDelayMs(error);
    if (delay === null) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return task();
  }
}

/**
 * The side panel list, patched or refetched by `debate.lobbies_changed`. Reloaded on every mount:
 * patches stop while the panel is closed.
 */
export function useDebateLobbies(enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.lobbies(accountKey),
    queryFn: ({ signal }) => listDebateLobbies(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
    refetchOnMount: 'always',
  });
}

/** The lobby the viewer is on the roster of, across tabs; see `DebateMyLobby`. */
export function useMyDebateLobby(enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.myLobby(accountKey),
    queryFn: ({ signal }) => getMyDebateLobby(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && ready && authenticated,
  });
}

/** Floor between refetches at `opens_at`, so a client clock ahead of the server cannot spin. */
const OPENS_REFETCH_MIN_MS = 5_000;
/** `setTimeout`'s ceiling; a later opening refetches early and schedules again. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * One lobby. Kept current by `debate.lobby_changed` and the heartbeat's own view. That event only
 * reaches people in the lobby, so a lobby not yet open is refetched at `opens_at`.
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
  const { refetch, dataUpdatedAt, errorUpdatedAt } = query;
  React.useEffect(() => {
    if (!opensAt) return;
    const at = Date.parse(opensAt);
    if (Number.isNaN(at)) return;
    const delay = Math.min(Math.max(at - Date.now() + 1_000, OPENS_REFETCH_MIN_MS), MAX_TIMEOUT_MS);
    const timeout = setTimeout(() => void refetch(), delay);
    return () => clearTimeout(timeout);
    // Reschedules after a refetch that still says not yet open, or that failed.
  }, [dataUpdatedAt, errorUpdatedAt, opensAt, refetch]);

  return query;
}

/** Writes a returned view into the lobby's cache entry and marks the list stale. */
export function useStoreLobbyView() {
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
  /** In another open lobby; joining this one leaves it, so the viewer is asked first. */
  | { status: 'confirm_leave_other'; otherLobbyId: string | null; rejoin?: true }
  /** Joined another lobby from another tab, which dropped this one; no automatic rejoin. */
  | { status: 'moved'; otherLobbyId: string | null }
  /** Left to debate, still on the roster; "Back to the room" joins again. */
  | { status: 'stepped_out' }
  /** Taken out by the server; the refetched access says the rest. */
  | { status: 'dropped'; reason: 'ended' | 'banned' | 'removed' }
  | { status: 'left' }
  | { status: 'failed'; message: string };

/**
 * Presence in one lobby: joins once admitted, heartbeats while joined, and leaves on unmount,
 * `pagehide` or Leave. A heartbeat answering `lapsed` joins again.
 */
export function useLobbyPresence(
  lobbyId: string,
  admitted: boolean,
  steppedOut = false,
  connected = false,
  removed = false
) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const store = useStoreLobbyView();
  const connectionId = useConnectionId();
  const [state, setRenderedState] = React.useState<LobbyPresenceState>({ status: 'idle' });
  // Current as of the last update rather than the last render, so `stepOut` sees a server
  // step-out that landed in the same tick as the routing.
  const statusRef = React.useRef(state.status);
  const setState = React.useCallback((next: LobbyPresenceState) => {
    statusRef.current = next.status;
    setRenderedState(next);
  }, []);

  // A token refresh must not re-run the effects below.
  const tokenRef = React.useRef(getPrivyIdentityToken);
  React.useEffect(() => {
    tokenRef.current = getPrivyIdentityToken;
  }, [getPrivyIdentityToken]);

  // Joined per the last answer; drives the heartbeat.
  const joinedRef = React.useRef(false);
  // This tab holds the lobby's voice connection; reported on each heartbeat.
  const voiceConnectedRef = React.useRef(false);
  const setVoiceConnected = React.useCallback((connected: boolean) => {
    voiceConnectedRef.current = connected;
  }, []);
  // When voice stops keeping the viewer available without input, per the last heartbeat.
  const [voiceAwayAt, setVoiceAwayAt] = React.useState<string | null>(null);
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
    /** `rejoin` only from the removed screen's Rejoin: the viewer chose to come back. */
    async (leaveOtherLobby = false, rejoin = false) => {
      const generation = generationRef.current;
      sentRef.current = true;
      setState({ status: 'joining' });
      try {
        const view = await enqueue(() =>
          retryOnceIfRateLimited(() =>
            setDebateLobbyPresence(
              lobbyId,
              {
                connection_id: connectionId,
                joined: true,
                leave_other_lobby: leaveOtherLobby,
                ...(rejoin ? { rejoin: true } : {}),
              },
              () => tokenRef.current(),
              accountKey
            )
          )
        );
        if (generation !== generationRef.current) return;
        store(view);
        // A lobby that would not admit answers with its view; the page renders its access.
        joinedRef.current = view.viewer.connected;
        setState(view.viewer.connected ? { status: 'joined' } : { status: 'idle' });
      } catch (error) {
        if (generation !== generationRef.current) return;
        joinedRef.current = false;
        sentRef.current = false;
        // Any join, automatic or not, lands on the removed screen; only its Rejoin sends `rejoin`.
        if (isRemovedFromLobby(error)) {
          setState({ status: 'dropped', reason: 'removed' });
          return;
        }
        if (isAlreadyInAnotherLobby(error)) {
          setState({
            status: 'confirm_leave_other',
            otherLobbyId: otherLobbyIdFrom(error),
            ...(rejoin ? { rejoin: true as const } : {}),
          });
          return;
        }
        setState({ status: 'failed', message: lobbyErrorMessage(error, 'Could not join this lobby. Try again.') });
      }
    },
    [accountKey, connectionId, enqueue, lobbyId, setState, store]
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
  }, [enqueue, sendLeave, setState, store]);

  // Out of the lobby without a leave: stops the heartbeat and the unmount's leave.
  const stopWithout = React.useCallback(
    (next: LobbyPresenceState) => {
      generationRef.current += 1;
      sentRef.current = false;
      joinedRef.current = false;
      setState(next);
    },
    [setState]
  );

  const stepOut = React.useCallback(async () => {
    // The server can step the viewer out first (the debate's start reaches the heartbeat before
    // the routing), and the lobby must still be where the debate returns to.
    const steppedOutAlready = statusRef.current === 'stepped_out';
    if (!sentRef.current && !steppedOutAlready) return;
    rememberLobbyReturnDestination(lobbyId);
    // Only a press on the coming debate's end card may skip the stepped-out prompt.
    clearLobbyRejoin();
    if (!sentRef.current) return;
    stopWithout({ status: 'stepped_out' });
    try {
      store(
        await enqueue(() =>
          stepOutOfDebateLobby(lobbyId, { connection_id: connectionId }, () => tokenRef.current(), accountKey)
        )
      );
    } catch {
      // `lobby_not_present`, or the server steps them out from the debate itself.
    }
  }, [accountKey, connectionId, enqueue, lobbyId, stopWithout, store]);

  /** Stepped out, leave for good. */
  const leaveSteppedOut = React.useCallback(async () => {
    stopWithout({ status: 'left' });
    try {
      store(await enqueue(() => endDebateLobbyStepOut(lobbyId, () => tokenRef.current(), accountKey)));
    } catch {
      // Step-out expires on its own.
    }
  }, [accountKey, enqueue, lobbyId, stopWithout, store]);

  React.useEffect(() => {
    return registerLobbyStepOut(stepOut);
  }, [stepOut]);

  // Auto-join once admitted, unless the viewer left, is being asked about another lobby, or
  // stepped out, where going back is their call unless the debate's end card already made it.
  const status = state.status;
  React.useEffect(() => {
    if (!admitted || status !== 'idle') return;
    // Consumed on every arrival so a flag left by a failed leave cannot outlive it.
    const rejoin = consumeLobbyRejoin(lobbyId);
    // A host removed them, possibly mid-debate: coming back is their call, even after Back to the room.
    if (removed) setState({ status: 'dropped', reason: 'removed' });
    else if (steppedOut && !rejoin) setState({ status: 'stepped_out' });
    else void join(false);
  }, [admitted, join, lobbyId, removed, setState, status, steppedOut]);

  // Unbanned after a ban this tab heard: the view is admitted again with `removed`, so the
  // viewer gets the removed screen and its Rejoin rather than a stale ban.
  const droppedBanned = state.status === 'dropped' && state.reason === 'banned';
  React.useEffect(() => {
    if (droppedBanned && admitted && removed) setState({ status: 'dropped', reason: 'removed' });
  }, [admitted, droppedBanned, removed, setState]);

  const beatNowRef = React.useRef<(() => void) | null>(null);

  const onGone = React.useCallback(
    (heartbeat: DebateLobbyHeartbeat) => {
      switch (heartbeat.reason) {
        case 'moved':
          stopWithout({
            status: 'moved',
            otherLobbyId: heartbeat.current_lobby_id ? dashlessId(heartbeat.current_lobby_id) : null,
          });
          return;
        case 'stepped_out':
          stopWithout({ status: 'stepped_out' });
          void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobby(accountKey, lobbyId) });
          return;
        case 'ended':
        case 'banned':
        case 'removed':
          stopWithout({ status: 'dropped', reason: heartbeat.reason });
          void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobby(accountKey, lobbyId) });
          return;
        default:
          // `lapsed`. Off the roster, the page missed the lobby's events; reread what they keep current.
          void join(false).then(() => {
            if (!joinedRef.current) return;
            void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyHighlights(accountKey, lobbyId) });
            void queryClient.invalidateQueries({ queryKey: debateQueryKeys.lobbyClaims(accountKey, lobbyId) });
          });
      }
    },
    [accountKey, join, lobbyId, queryClient, stopWithout]
  );

  // Heartbeat while joined; `reason` says what a dropped connection does next. A tab coming back
  // from the background beats at once, since its timers may have been throttled.
  React.useEffect(() => {
    if (status !== 'joined' || !admitted) return;
    let lastBeat = Date.now();
    // A 429 waits out `Retry-After` and beats again; it is never read as a lapsed lease, since a
    // rejoin would be limited too. The 120s lease covers a throttled beat or two.
    let backoffUntil = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const beat = () => {
      if (Date.now() < backoffUntil) return;
      lastBeat = Date.now();
      void sendDebateLobbyHeartbeat(
        lobbyId,
        { connection_id: connectionId, voice_connected: voiceConnectedRef.current },
        () => tokenRef.current(),
        accountKey
      )
        .then(heartbeat => {
          setVoiceAwayAt(heartbeat.voice_away_at);
          if (joinedRef.current && !heartbeat.connection_alive) onGone(heartbeat);
        })
        .catch(error => {
          const delay = rateLimitDelayMs(error);
          if (delay === null) return;
          backoffUntil = Date.now() + delay;
          if (retry) clearTimeout(retry);
          retry = setTimeout(beat, delay);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastBeat >= VISIBLE_BEAT_MIN_GAP_MS) beat();
    };
    beatNowRef.current = beat;
    const interval = setInterval(beat, LOBBY_HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      beatNowRef.current = null;
      if (retry) clearTimeout(retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accountKey, admitted, connectionId, lobbyId, onGone, status]);

  // A view saying this viewer is out (`debate.lobby_changed`) beats at once rather than waiting for
  // the interval, which a hidden tab throttles, so a server step-out takes the mic down promptly.
  // The beat's `reason` decides, since a view fetched before a rejoin can be stale.
  React.useEffect(() => {
    if ((steppedOut || !connected) && joinedRef.current) beatNowRef.current?.();
  }, [connected, steppedOut]);

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
        void queue(() => retryOnceIfRateLimited(() => sendLeaveRef.current(true))).catch(() => undefined);
      }
      // Ignored after a real unmount; after StrictMode's test unmount it lets the remount join.
      setState({ status: 'idle' });
    };
  }, [enqueue, setState]);

  return { state, join, leave, leaveSteppedOut, connectionId, setVoiceConnected, voiceAwayAt };
}
