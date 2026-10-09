'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyGuestView,
  GeoChatRequestError,
  dashlessId,
  getDebateLobbyGuestView,
  leaveDebateLobbyGuest,
  sendDebateLobbyGuestHeartbeat,
  startDebateLobbyGuest,
} from '../api';
import { debateQueryNetworkOptions } from '../hooks';
import { rateLimitDelayMs } from './hooks';
import { lobbyErrorMessage } from './lobby-format';
import { clearGuestSecret, readGuestSecret, storeGuestSecret } from './lobby-guest-secret';
import {
  type GuestSessionCommand,
  type GuestSessionEvent,
  type GuestSessionState,
  orphanedAnswerLeaves,
  transition,
} from './lobby-guest-session';

/** While visible; every 30s hidden, and at once on focus. The server caches each lobby for 2s. */
export const GUEST_VIEW_POLL_MS = 5_000;
export const GUEST_VIEW_HIDDEN_POLL_MS = 30_000;

/** Not under `account`: the same for every visitor, and no sign-in reconcile touches it. */
export const guestViewQueryKey = (lobbyId: string) => ['debates', 'lobby-guest-view', dashlessId(lobbyId)] as const;

/**
 * The guest view (GEO-3129), one read for lobby, claims and highlights. Only the page's own call
 * polls (`poll`); the claims and highlights read the same entry, so a page has one poller.
 */
export function useDebateLobbyGuestView<T = DebateLobbyGuestView>(
  lobbyId: string,
  { enabled, poll = false, select }: { enabled: boolean; poll?: boolean; select?: (view: DebateLobbyGuestView) => T }
) {
  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: guestViewQueryKey(lobbyId),
    queryFn: ({ signal }) => getDebateLobbyGuestView(dashlessId(lobbyId), signal),
    enabled: enabled && Boolean(lobbyId),
    select,
    ...(poll
      ? {
          refetchInterval: () =>
            typeof document !== 'undefined' && document.visibilityState === 'hidden'
              ? GUEST_VIEW_HIDDEN_POLL_MS
              : GUEST_VIEW_POLL_MS,
          refetchIntervalInBackground: true,
          refetchOnWindowFocus: 'always' as const,
        }
      : {}),
  });
}

const LobbyGuestContext = React.createContext(false);

/** The page is showing a visitor without an account; member reads stay off. */
export const LobbyGuestProvider = LobbyGuestContext.Provider;

export function useIsLobbyGuest() {
  return React.useContext(LobbyGuestContext);
}

const HEARTBEAT_FALLBACK_MS = 20_000;

/** Where the signed-in path stands: a failed one means this tab stops being a guest. */
export type LobbyMemberPath = 'pending' | 'joined' | 'failed';

async function requestStart(lobbyId: string) {
  const stored = readGuestSecret(lobbyId);
  try {
    return await startDebateLobbyGuest(lobbyId, stored ? { guest_secret: stored } : {});
  } catch (error) {
    // A reconnect that lost a race: that session is over, so start a new one.
    if (!stored || !(error instanceof GeoChatRequestError) || error.code !== 'guest_session_ended') throw error;
    clearGuestSecret(lobbyId);
    return startDebateLobbyGuest(lobbyId, {});
  }
}

/**
 * Runs the guest session machine (`lobby-guest-session.ts`) for one lobby page: starts while
 * `listen`, heartbeats while listening, and leaves on unload. A signed-in person never starts.
 */
export function useLobbyGuestSession(
  lobbyId: string,
  { listen, signedIn, member }: { listen: boolean; signedIn: boolean; member: LobbyMemberPath }
) {
  const id = dashlessId(lobbyId);
  const [state, setState] = React.useState<GuestSessionState>({ status: 'idle', attempt: 0 });
  // Read by answers and events that land between renders.
  const stateRef = React.useRef(state);
  const signedInRef = React.useRef(signedIn);
  React.useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);
  const mountedRef = React.useRef(false);
  // The attempt whose start is in flight; a StrictMode re-run of the effect finds it and waits.
  const inflightRef = React.useRef<number | null>(null);

  const runCommand = React.useCallback(
    (command: GuestSessionCommand) => {
      switch (command.type) {
        case 'leave':
          void leaveDebateLobbyGuest(id, { guest_secret: command.secret }, true).catch(() => undefined);
          return;
        case 'storeSecret':
          return storeGuestSecret(id, command.secret);
        case 'clearSecret':
          return clearGuestSecret(id);
      }
    },
    [id]
  );

  const send = React.useCallback(
    (event: GuestSessionEvent) => {
      const { next, commands } = transition(stateRef.current, event, { signedIn: signedInRef.current });
      commands.forEach(runCommand);
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
    },
    [runCommand]
  );

  const status = state.status;
  React.useEffect(() => {
    if (listen && !signedIn && status === 'idle') send({ type: 'start' });
  }, [listen, send, signedIn, status]);

  React.useEffect(() => {
    if (member === 'joined') send({ type: 'memberJoined' });
    else if (member === 'failed' && signedIn) send({ type: 'abandon' });
  }, [member, send, signedIn, status]);

  // One request per `starting` attempt.
  const startingAttempt = state.status === 'starting' ? state.attempt : null;
  React.useEffect(() => {
    if (startingAttempt === null || inflightRef.current === startingAttempt) return;
    const attempt = startingAttempt;
    inflightRef.current = attempt;
    const current = () =>
      mountedRef.current && stateRef.current.status === 'starting' && stateRef.current.attempt === attempt;
    void requestStart(id)
      .then(
        session => {
          if (current()) return send({ type: 'started', attempt, session });
          if (orphanedAnswerLeaves(session.guest_secret, readGuestSecret(id))) {
            runCommand({ type: 'leave', secret: session.guest_secret });
          }
        },
        error => {
          if (!current()) return;
          if (error instanceof GeoChatRequestError && error.code === 'lobby_guest_removed') {
            return send({ type: 'removed' });
          }
          const delay = error instanceof GeoChatRequestError ? (error.retryAfterMs ?? null) : null;
          send({
            type: 'refused',
            attempt,
            message: lobbyErrorMessage(error, 'Couldn’t start listening. Try again.'),
            retryAt: delay === null ? null : Date.now() + delay,
          });
        }
      )
      .finally(() => {
        if (inflightRef.current === attempt) inflightRef.current = null;
      });
  }, [id, runCommand, send, startingAttempt]);

  // Heartbeat while listening; only `lapsed` starts again.
  const session = state.status === 'listening' ? state.session : null;
  React.useEffect(() => {
    if (!session) return;
    const secret = session.guest_secret;
    const every = Math.max(session.heartbeat_interval_seconds * 1_000, 5_000) || HEARTBEAT_FALLBACK_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const beat = (delay: number) => {
      timer = setTimeout(async () => {
        try {
          const heartbeat = await sendDebateLobbyGuestHeartbeat(id, { guest_secret: secret });
          if (stopped) return;
          if (heartbeat.alive) return beat(every);
          switch (heartbeat.reason) {
            case 'removed':
              return send({ type: 'removed' });
            case 'ended':
              return send({ type: 'ended' });
            case 'left':
              // This tab's own member join or leave.
              return;
            default:
              return send({ type: 'restart' });
          }
        } catch (error) {
          if (stopped) return;
          beat(rateLimitDelayMs(error) ?? every);
        }
      }, delay);
    };
    beat(every);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, send, session]);

  // Leave on unload and unmount while listening; a bfcache restore starts again on the same secret.
  React.useEffect(() => {
    mountedRef.current = true;
    const leave = () => {
      const current = stateRef.current;
      if (current.status === 'listening') runCommand({ type: 'leave', secret: current.session.guest_secret });
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) send({ type: 'restart' });
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      mountedRef.current = false;
      leave();
    };
  }, [runCommand, send]);

  return {
    state,
    /** After a refusal. Not once signed in. */
    retry: React.useCallback(() => send({ type: 'start' }), [send]),
    /** A fresh token for a full reconnect, on the same guest. */
    reconnect: React.useCallback(() => send({ type: 'restart' }), [send]),
    /** The member room is up, or will not come up: drop the guest room. */
    roomDone: React.useCallback(() => send({ type: 'roomDone' }), [send]),
  };
}
