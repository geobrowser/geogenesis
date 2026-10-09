'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateLobbyGuestLobby,
  type DebateLobbyGuestSession,
  type DebateLobbyGuestView,
  type DebateLobbyView,
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

/** What a guest's page reads off `viewer`: nobody, with no role and no powers. */
const GUEST_VIEWER: DebateLobbyView['viewer'] = {
  role: null,
  creator: false,
  hosting: false,
  reminded: false,
  voice_away_at: null,
  connected: false,
  stepped_out: false,
};

/** The guest view's lobby in the member view's shape, so the page's components read it as is. */
export function lobbyViewForGuest(lobby: DebateLobbyGuestLobby): DebateLobbyView {
  return { ...lobby, viewer: GUEST_VIEWER };
}

/** True for the view drawn to a visitor without an account. */
export function isGuestLobbyView(lobby: DebateLobbyView) {
  return lobby.viewer === GUEST_VIEWER;
}

const LobbyGuestContext = React.createContext(false);

/** The page is showing a visitor without an account; member reads stay off. */
export const LobbyGuestProvider = LobbyGuestContext.Provider;

export function useIsLobbyGuest() {
  return React.useContext(LobbyGuestContext);
}

export type LobbyGuestSessionState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'listening'; session: DebateLobbyGuestSession }
  /** Refused or failed; `retryAt` is when the server said a retry could work. */
  | { status: 'refused'; message: string; retryAt: number | null }
  | { status: 'removed' }
  | { status: 'ended' };

const HEARTBEAT_FALLBACK_MS = 20_000;

/**
 * A visitor's guest session: starts once the lobby is open, heartbeats, restarts only on `lapsed`,
 * leaves on unload. After `release` (the member join ended it) it sends nothing; its room plays on.
 */
export function useLobbyGuestSession(lobbyId: string, enabled: boolean) {
  const id = dashlessId(lobbyId);
  const [state, setState] = React.useState<LobbyGuestSessionState>({ status: 'idle' });
  const [released, setReleased] = React.useState(false);
  // Bumped by unmount and release; an answer under an older one is dropped.
  const generationRef = React.useRef(0);
  const secretRef = React.useRef<string | null>(null);

  const start = React.useCallback(async () => {
    const generation = generationRef.current;
    setState({ status: 'starting' });
    const stored = readGuestSecret(id);
    try {
      const session = await startDebateLobbyGuest(id, stored ? { guest_secret: stored } : {});
      if (generation !== generationRef.current) return;
      storeGuestSecret(id, session.guest_secret);
      secretRef.current = session.guest_secret;
      setState({ status: 'listening', session });
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (error instanceof GeoChatRequestError && error.code === 'lobby_guest_removed') {
        setState({ status: 'removed' });
        return;
      }
      const delay = error instanceof GeoChatRequestError ? (error.retryAfterMs ?? null) : null;
      setState({
        status: 'refused',
        message: lobbyErrorMessage(error, 'Couldn’t start listening. Try again.'),
        retryAt: delay === null ? null : Date.now() + delay,
      });
    }
  }, [id]);

  const status = state.status;
  const active = enabled && !released;
  React.useEffect(() => {
    if (active && status === 'idle') void start();
  }, [active, start, status]);

  // Heartbeat while listening; only `lapsed` starts again.
  const session = state.status === 'listening' ? state.session : null;
  React.useEffect(() => {
    if (!session || released) return;
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
              return setState({ status: 'removed' });
            case 'ended':
              clearGuestSecret(id);
              return setState({ status: 'ended' });
            case 'left':
              // This tab's own member join or leave; nothing to do.
              return;
            default:
              return void start();
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
  }, [id, released, session, start]);

  // Leave on unload and unmount, unless a member join already ended the session.
  const releasedRef = React.useRef(released);
  releasedRef.current = released;
  const listeningRef = React.useRef(false);
  listeningRef.current = state.status === 'listening';
  React.useEffect(() => {
    const leave = () => {
      const secret = secretRef.current;
      if (!secret || releasedRef.current) return;
      void leaveDebateLobbyGuest(id, { guest_secret: secret }, true).catch(() => undefined);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted && secretRef.current && !releasedRef.current) setState({ status: 'idle' });
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      generationRef.current += 1;
      leave();
      secretRef.current = null;
      // After StrictMode's test unmount, lets the remount start again.
      setState({ status: 'idle' });
    };
  }, [id]);

  /** A fresh token for a full reconnect, on the same guest. */
  const reconnect = React.useCallback(() => {
    generationRef.current += 1;
    void start();
  }, [start]);

  /** The member join ended this session; stop heartbeating and never send a leave. */
  /** The member room is up, or there is no guest room to wait for: drop it and forget the secret. */
  const handOver = React.useCallback(() => {
    generationRef.current += 1;
    setReleased(true);
    clearGuestSecret(id);
    secretRef.current = null;
    setState({ status: 'idle' });
  }, [id]);

  /** The member join ended this session. A playing guest room waits for `handOver`. */
  const release = React.useCallback(() => {
    if (!listeningRef.current) return handOver();
    generationRef.current += 1;
    setReleased(true);
  }, [handOver]);

  return { state, released, reconnect, release, handOver, retry: start };
}
