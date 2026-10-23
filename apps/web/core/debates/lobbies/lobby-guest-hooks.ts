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
import { isGuestListeningOff, lobbyErrorMessage } from './lobby-format';
import { clearGuestSecret, readGuestSecret, storeGuestSecret } from './lobby-guest-secret';
import {
  type GuestSessionCommand,
  type GuestSessionEvent,
  type GuestSessionState,
  transition,
} from './lobby-guest-session';
import {
  acquireGuestTabLock,
  isGuestListeningElsewhere,
  lobbyListeningElsewhere,
  onGuestTabLockLost,
  releaseGuestTabLock,
} from './lobby-guest-tab-lock';
import { useLobbyRoomNoun } from './lobby-purpose';

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
/** Statuses whose tab keeps the listening lock. */
const HOLDS_LOCK: ReadonlySet<GuestSessionState['status']> = new Set([
  'starting',
  'listening',
  'refused',
  'handingOver',
]);
/** How often a tab waiting on a press checks whether another tab still listens. */
export const ELSEWHERE_CHECK_MS = 3_000;

/** Where the signed-in path stands: a failed one means this tab stops being a guest. */
export type LobbyMemberPath = 'pending' | 'joined' | 'failed';

/** Resumes on the stored secret: geo-chat re-admits a lapsed or left session and refuses a removed one. */
function requestStart(lobbyId: string) {
  const stored = readGuestSecret(lobbyId);
  return startDebateLobbyGuest(lobbyId, stored ? { guest_secret: stored } : {});
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
  const room = useLobbyRoomNoun();
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
          void leaveDebateLobbyGuest(id, { guest_secret: command.secret, admission: command.admission }, true).catch(
            () => undefined
          );
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

  // Starts only with this browser's listening lock; without it, waits on a press (`retry`). A hidden
  // tab, such as a link opened in the background, waits until it is shown.
  const status = state.status;
  React.useEffect(() => {
    if (!listen || signedIn || status !== 'idle') return;
    let cancelled = false;
    const run = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', run);
      void acquireGuestTabLock({ lobbyId: id }).then(held => {
        if (!cancelled && stateRef.current.status === 'idle') {
          return send(held ? { type: 'start' } : { type: 'elsewhere', sameLobby: false });
        }
        if (!held) return;
        // Granted after this run was dropped: a tick later, a re-run has started on it or nobody needs it.
        setTimeout(() => {
          if (mountedRef.current && !HOLDS_LOCK.has(stateRef.current.status)) releaseGuestTabLock({ now: true });
        }, 0);
      });
    };
    document.addEventListener('visibilitychange', run);
    run();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', run);
    };
  }, [id, listen, send, signedIn, status]);

  const elsewhere = React.useCallback(() => {
    const other = lobbyListeningElsewhere();
    send({ type: 'elsewhere', sameLobby: other !== null && dashlessId(other) === id });
  }, [id, send]);
  React.useEffect(() => onGuestTabLockLost(elsewhere), [elsewhere]);

  // Only a tab that listens, or may retry, keeps the lock.
  const releasable = status === 'superseded' || status === 'removed' || status === 'ended' || status === 'released';
  React.useEffect(() => {
    if (releasable) releaseGuestTabLock();
  }, [releasable]);

  // While waiting on a press: whether another tab still listens, for the notice.
  const [otherTabListening, setOtherTabListening] = React.useState(true);
  React.useEffect(() => {
    if (status !== 'superseded') return;
    let stopped = false;
    const check = () =>
      void isGuestListeningElsewhere().then(elsewhere => {
        // Unknown (no Web Locks): a later admission superseded this page, so another one listens.
        if (!stopped && elsewhere !== null) setOtherTabListening(elsewhere);
      });
    check();
    const timer = setInterval(check, ELSEWHERE_CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [status]);

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
          // Nobody listens on this admission. Its leave is a no-op if a later admission holds the session.
          runCommand({ type: 'leave', secret: session.guest_secret, admission: session.admission });
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
            message: lobbyErrorMessage(error, 'Couldn’t start listening. Try again.', room),
            retryAt: delay === null ? null : Date.now() + delay,
            retryable: !isGuestListeningOff(error),
          });
        }
      )
      .finally(() => {
        if (inflightRef.current === attempt) inflightRef.current = null;
      });
  }, [id, room, runCommand, send, startingAttempt]);

  // Heartbeat while listening; only `lapsed` starts again. `checkNow` beats at once.
  const session = state.status === 'listening' ? state.session : null;
  const beatNowRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    if (!session) return;
    const body = { guest_secret: session.guest_secret, admission: session.admission };
    const every = Math.max(session.heartbeat_interval_seconds * 1_000, 5_000) || HEARTBEAT_FALLBACK_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    // Set by `checkNow`: an alive session is still this tab's, so it reconnects.
    let restartIfAlive = false;
    const beat = (delay: number) => {
      timer = setTimeout(async () => {
        try {
          const heartbeat = await sendDebateLobbyGuestHeartbeat(id, body);
          if (stopped) return;
          if (heartbeat.alive) {
            if (restartIfAlive) return send({ type: 'restart' });
            return beat(every);
          }
          switch (heartbeat.reason) {
            case 'removed':
              return send({ type: 'removed' });
            case 'ended':
              return send({ type: 'ended' });
            case 'superseded':
              return send({ type: 'superseded' });
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
    beatNowRef.current = () => {
      restartIfAlive = true;
      if (timer) clearTimeout(timer);
      beat(0);
    };
    return () => {
      stopped = true;
      beatNowRef.current = null;
      if (timer) clearTimeout(timer);
    };
  }, [id, send, session]);

  // Leave on unload and unmount while listening; a bfcache restore starts again on the same secret
  // if no other tab took listening meanwhile.
  React.useEffect(() => {
    mountedRef.current = true;
    const leave = () => {
      const current = stateRef.current;
      if (current.status !== 'listening') return;
      runCommand({ type: 'leave', secret: current.session.guest_secret, admission: current.session.admission });
    };
    const hide = () => {
      leave();
      releaseGuestTabLock({ now: true });
    };
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted || stateRef.current.status !== 'listening') return;
      void acquireGuestTabLock({ lobbyId: id }).then(held => (held ? send({ type: 'restart' }) : elsewhere()));
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', restore);
      mountedRef.current = false;
      leave();
      releaseGuestTabLock();
    };
  }, [elsewhere, id, runCommand, send]);

  return {
    state,
    /** After a refusal, or to take listening from another tab. Not once signed in. */
    retry: React.useCallback(() => {
      void acquireGuestTabLock({ steal: true, lobbyId: id }).then(() => send({ type: 'start' }));
    }, [id, send]),
    /** Waiting on a press: another tab in this browser listens now. */
    otherTabListening,
    /** A fresh token for a full reconnect, on the same guest. */
    reconnect: React.useCallback(() => send({ type: 'restart' }), [send]),
    /** The member room is up, or will not come up: drop the guest room. */
    roomDone: React.useCallback(() => send({ type: 'roomDone' }), [send]),
    /** The server removed this tab's room: ask the session why (superseded, removed, ended). */
    checkNow: React.useCallback(() => beatNowRef.current?.(), []),
  };
}
