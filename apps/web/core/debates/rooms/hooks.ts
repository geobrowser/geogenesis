'use client';

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type DebateRoomView,
  type UpcomingDebateRoom,
  getDebate,
  getDebateRematch,
  getDebateRoom,
  listUpcomingDebateRooms,
  setDebateRoomPresence,
} from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useServerClock } from '../matchmaking/use-request-countdown';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { debateRoomOpponent, debateRoomPresence } from './room-presence';

/**
 * Arrivals and departures now come as `debate.requests_changed`, but that event is new, so this
 * stays tight until it has proven itself. Tighter than the rematch's 5s because the indicator is
 * what two people watch for each other on.
 */
const ROOM_POLL_MS = 3_000;

/** A backstop: `debate.requests_changed` covers booked rooms and arrivals in them. */
const UPCOMING_ROOMS_POLL_MS = 60_000;

/** Both halves of presence are worth re-sending: an unrecorded arrival or departure misleads the opponent. */
const PRESENCE_RETRIES = 3;
const PRESENCE_RETRY_MS = 2_000;

export function useDebateRoom(roomId: string, enabled = true) {
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  // Visibility rather than attention, as the rematch query uses: waiting for someone while looking
  // at another window is exactly this flow.
  const present = useDebateVisibility();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.room(accountKey, roomId),
    queryFn: ({ signal }) => getDebateRoom(roomId, getPrivyIdentityToken, accountKey, signal),
    // `authenticated`, or the fetcher throws before it reaches the wire and the page reports a
    // failure at a viewer who has simply not signed in — or has, and Privy is still restoring.
    enabled: enabled && Boolean(roomId) && ready && authenticated,
    // A lobby is read from `/debate-lobbies/{id}`; its room view only says it is one.
    refetchInterval: query => (query.state.data?.kind === 'lobby' ? false : present ? ROOM_POLL_MS : false),
  });
}

/**
 * This tab's identity, stable for the document's life. Occupancy is per connection, so a leave
 * keyed only by user would tell an opponent that someone closing a second tab had left.
 *
 * The server parses this as a uuid and rejects anything else, so the fallback is uuid-shaped: a
 * page served over plain http on a LAN address has no `crypto.randomUUID`.
 */
export function useConnectionId() {
  const ref = React.useRef<string>('');
  if (!ref.current) ref.current = globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
  return ref.current;
}

function fallbackUuid() {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker =>
    marker === 'x' ? hex() : ((Math.floor(Math.random() * 4) + 8) & 0xf).toString(16)
  );
}

/**
 * Every presence request this document sends, in order. Occupancy is the latest event per
 * connection, so a join still in flight when the leave goes out must not land after it.
 */
let presenceQueue: Promise<unknown> = Promise.resolve();

function enqueuePresence<T>(task: () => Promise<T>): Promise<T> {
  const next = presenceQueue.catch(() => undefined).then(task);
  presenceQueue = next.catch(() => undefined);
  return next;
}

/** A few tries with a growing gap. `shouldStop` lets a cancelled join give up between attempts. */
async function withRetry<T>(task: () => Promise<T>, shouldStop: () => boolean = () => false): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= PRESENCE_RETRIES || shouldStop()) throw error;
      await new Promise(resolve => setTimeout(resolve, PRESENCE_RETRY_MS * (attempt + 1)));
      // Again after the wait: a leave sent during it must not be followed by this join.
      if (shouldStop()) throw error;
    }
  }
}

/** Past the start before announcing again, so the join lands after it on the server. */
const START_MARGIN_MS = 1_000;
/** Between joins after the start while geo-chat has not counted one as an arrival. */
const ARRIVAL_RETRY_MS = 30_000;
/** Enough to outlast a long drop at the start; a room that never counts one stops asking. */
const MAX_ARRIVAL_TRIES = 20;
/** `setTimeout` overflows past this; a room booked further ahead re-arms on waking. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Announces arrival once admitted, and departure on both exits: unmount is navigating within the
 * app, `pagehide` is closing the tab. A duplicate leave changes nothing. Everything the leave
 * needs is captured inside the effect: a ref written during render already holds the next room by
 * cleanup time.
 */
export function useRoomPresence(roomId: string, admitted: boolean, startsAt: string | null = null) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const connectionId = useConnectionId();
  // The server's time where it has synced: the start below is the server's, and a laptop clock a
  // few seconds behind would announce just before it and not count as arriving.
  const clock = useServerClock(admitted && startsAt !== null);
  const clockRef = React.useRef(clock);
  clockRef.current = clock;

  // `getPrivyIdentityToken` only reads the current session, so holding it in a ref keeps a token
  // refresh from re-running the join/leave pair.
  const tokenRef = React.useRef(getPrivyIdentityToken);
  tokenRef.current = getPrivyIdentityToken;
  const announceRef = React.useRef<(() => Promise<boolean>) | null>(null);

  React.useEffect(() => {
    if (!admitted) return;

    const send = (joined: boolean, keepalive = false) =>
      enqueuePresence(() =>
        setDebateRoomPresence(
          roomId,
          { connection_id: connectionId, joined },
          () => tokenRef.current(),
          accountKey,
          keepalive
        )
      );

    let cancelled = false;

    // An arrival nobody recorded is invisible to the opponent and counts towards a no-show, so a
    // dropped join is retried rather than swallowed. A refusal is reported by the room query's own
    // `access`, which is the surface that explains it. Resolves the room as the join left it, or
    // `null` once the retries are spent.
    const announceRoom = (): Promise<DebateRoomView | null> =>
      withRetry(
        () => send(true),
        () => cancelled
      )
        .then(room => {
          if (cancelled) return null;
          queryClient.setQueryData(debateQueryKeys.room(accountKey, roomId), room);
          return room;
        })
        .catch(() => null);
    const announce = () => announceRoom().then(room => room !== null);

    // GEO-3427: geo-chat counts someone as having arrived by a join at or after the start, so that a
    // tab left open from a look in before it (or a crashed one) does not count. A tab someone is
    // actually waiting in says so again once the start passes; a dead one never does.
    //
    // Settled by geo-chat's own answer, `viewer_arrived`, not by a flag here or by this device's
    // clock: a laptop a few seconds fast, or a network drop right at the start, would otherwise
    // leave someone waiting in the room counted as absent for good. Until it says so the join is
    // sent again: at the start, every so often after it, and on coming back to the tab.
    const startMs = startsAt ? Date.parse(startsAt) : Number.NaN;
    const now = () => clockRef.current?.now() ?? Date.now();
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let arrived = !Number.isFinite(startMs);
    let tries = 0;
    let inFlight = false;
    const answered = (room: DebateRoomView | null) => {
      if (cancelled || arrived) return;
      // A geo-chat older than `viewer_arrived` has nothing to say: a join past the start has to do.
      if (room?.viewer_arrived === true || (room && room.viewer_arrived === undefined && now() >= startMs)) {
        arrived = true;
        return;
      }
      clearTimeout(startTimer);
      if (tries >= MAX_ARRIVAL_TRIES) return;
      startTimer = setTimeout(arriveAtStart, startMs - now() > 0 ? 0 : ARRIVAL_RETRY_MS);
    };
    const arriveAtStart = () => {
      if (cancelled || arrived || inFlight) return;
      clearTimeout(startTimer);
      const wait = startMs - now();
      if (wait > 0) {
        // Re-checked on waking, against the server's clock if it has synced since.
        startTimer = setTimeout(arriveAtStart, Math.min(wait + START_MARGIN_MS, MAX_TIMEOUT_MS));
        return;
      }
      inFlight = true;
      tries += 1;
      void announceRoom().then(room => {
        inFlight = false;
        answered(room);
      });
    };
    // A phone can suspend the tab past the start, and its timer with it: coming back says so too.
    const arriveOnReturn = () => {
      if (document.visibilityState === 'visible') arriveAtStart();
    };

    void announceRoom().then(answered);
    announceRef.current = announce;
    if (!arrived) document.addEventListener('visibilitychange', arriveOnReturn);

    // `pagehide` has no later, so the request is made rather than queued: a leave waiting behind
    // an in-flight join is never sent at all once the document freezes, and the server has no
    // staleness window to clean up after it. Ordering is worth less here than the request
    // existing -- losing the race leaves the same stale occupancy that queuing guarantees.
    const departOnce = () =>
      void setDebateRoomPresence(
        roomId,
        { connection_id: connectionId, joined: false },
        () => tokenRef.current(),
        accountKey,
        true
      ).catch(() => undefined);
    // `pageshow` is how a bfcached document comes back, restored without re-running effects, so
    // without it a back navigation reports a departure nothing ever takes back.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) void announce();
    };

    window.addEventListener('pagehide', departOnce);
    window.addEventListener('pageshow', restore);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      document.removeEventListener('visibilitychange', arriveOnReturn);
      announceRef.current = null;
      window.removeEventListener('pagehide', departOnce);
      window.removeEventListener('pageshow', restore);
      void withRetry(() => send(false, true)).catch(() => undefined);
    };
  }, [accountKey, admitted, connectionId, queryClient, roomId, startsAt]);

  // A join is also how a room gets a fresh session: geo-chat replaces an expired or ended one on the
  // next join, which an occupant who never left would otherwise not send.
  const rejoin = React.useCallback(() => announceRef.current?.() ?? Promise.resolve(false), []);

  return { connectionId, rejoin };
}

/**
 * The room's presence state, plus this visit's memory of having seen the opponent.
 *
 * The memory is keyed by room rather than held as a flag beside a reset, because `opponentPresent`
 * and the room id change in the same commit: a flag set by one effect and cleared by another in
 * that commit stays cleared, and a viewer who arrives second is never told the opponent left.
 */
export function useDebateRoomPresence(room: DebateRoomView | null | undefined) {
  const currentUserId = useCurrentGeoChatUserId();
  const { opponentPresent } = debateRoomOpponent(room, currentUserId);
  const roomId = room?.room_id ?? null;

  const [seenIn, setSeenIn] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (opponentPresent && roomId) setSeenIn(roomId);
  }, [opponentPresent, roomId]);

  const sawOpponent = seenIn !== null && seenIn === roomId;

  return React.useMemo(
    () => debateRoomPresence({ room, currentUserId, sawOpponent }),
    [room, currentUserId, sawOpponent]
  );
}

/**
 * Every room this viewer is expected in, open or imminent. One source for the join prompt and the
 * Requests tab (GEO-2940), so the two cannot disagree about what is due.
 */
export function useUpcomingDebateRooms(enabled = true) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const present = useDebateVisibility();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.upcomingRooms(accountKey),
    queryFn: ({ signal }) => listUpcomingDebateRooms(getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && authenticated,
    refetchInterval: present ? UPCOMING_ROOMS_POLL_MS : false,
  });
}

/**
 * Rooms whose session has already become a debate. geo-chat keeps listing them as joinable until
 * the empty-room sweep closes them, and joining one only walks back into the finished debate.
 */
export function useFinishedRoomIds(rooms: UpcomingDebateRoom[], enabled = true): ReadonlySet<string> {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const sessions = rooms.flatMap(room =>
    room.rematch_session_id ? [{ roomId: room.room_id, sessionId: room.rematch_session_id }] : []
  );

  // Same key as `useDebateRematch`, so the room page's own read and the gateway's invalidation on a
  // session change both land here.
  const results = useQueries({
    queries: sessions.map(({ sessionId }) => ({
      ...debateQueryNetworkOptions,
      queryKey: debateQueryKeys.rematch(accountKey, sessionId),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getDebateRematch(sessionId, getPrivyIdentityToken, accountKey, signal),
      enabled: enabled && authenticated,
      staleTime: 30_000,
    })),
  });

  const finished = sessions
    .filter((_, index) => results[index]?.data?.status === 'converted')
    .map(session => session.roomId)
    .sort()
    .join(',');

  return React.useMemo(() => new Set(finished ? finished.split(',') : []), [finished]);
}

/**
 * Whether one listed room's debate has already happened, as `useFinishedRoomIds` judges a list:
 * geo-chat goes on listing a converted room as joinable until the empty-room sweep closes it.
 * `null` while its session is read. A room nobody has been in has no session, so it has not.
 */
export function useRoomFinished(room: UpcomingDebateRoom | null): boolean | null {
  const sessionId = room?.rematch_session_id ?? null;
  const session = useRoomSession(sessionId);
  if (!sessionId) return false;
  if (session.isPending) return null;
  return session.data?.status === 'converted';
}

/** A room's session, on the same cache entry as `useDebateRematch`. */
export function useRoomSession(sessionId: string | null) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.rematch(accountKey, sessionId ?? ''),
    queryFn: ({ signal }) => getDebateRematch(sessionId ?? '', getPrivyIdentityToken, accountKey, signal),
    enabled: authenticated && Boolean(sessionId),
    // The room page waits on this before choosing what to render; a blip must not strand it.
    retry: 2,
  });
}

/** A debate's status, on the same cache entry as `useDebate`. */
export function useDebateStatus(debateId: string | null) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.debate(debateId ?? ''),
    queryFn: ({ signal }) => getDebate(debateId ?? '', getPrivyIdentityToken, accountKey, signal),
    enabled: authenticated && Boolean(debateId),
    retry: 2,
    select: debate => debate.status,
  });
}
