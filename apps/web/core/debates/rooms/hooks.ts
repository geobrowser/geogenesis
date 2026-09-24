'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type DebateRoomView, getDebateRoom, listUpcomingDebateRooms, setDebateRoomPresence } from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { debateRoomOpponent, debateRoomPresence } from './room-presence';

/**
 * geo-chat publishes no room event, so this poll is the mechanism rather than a backstop. Tighter
 * than the rematch's 5s because the indicator is what two people watch for each other on.
 */
const ROOM_POLL_MS = 3_000;

/** The join prompt is ambient rather than urgent, and the window it watches is minutes wide. */
const UPCOMING_ROOMS_POLL_MS = 30_000;

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
    refetchInterval: present ? ROOM_POLL_MS : false,
  });
}

/**
 * This tab's identity, stable for the document's life. Occupancy is per connection, so a leave
 * keyed only by user would tell an opponent that someone closing a second tab had left.
 *
 * The server parses this as a uuid and rejects anything else, so the fallback is uuid-shaped: a
 * page served over plain http on a LAN address has no `crypto.randomUUID`.
 */
function useConnectionId() {
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
    }
  }
}

/**
 * Announces arrival once admitted, and departure on both exits: unmount is navigating within the
 * app, `pagehide` is closing the tab. A duplicate leave changes nothing. Everything the leave
 * needs is captured inside the effect: a ref written during render already holds the next room by
 * cleanup time.
 */
export function useRoomPresence(roomId: string, admitted: boolean) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const connectionId = useConnectionId();

  // `getPrivyIdentityToken` only reads the current session, so holding it in a ref keeps a token
  // refresh from re-running the join/leave pair.
  const tokenRef = React.useRef(getPrivyIdentityToken);
  tokenRef.current = getPrivyIdentityToken;

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
    // `access`, which is the surface that explains it.
    const announce = () =>
      withRetry(
        () => send(true),
        () => cancelled
      )
        .then(room => {
          if (!cancelled) queryClient.setQueryData(debateQueryKeys.room(accountKey, roomId), room);
        })
        .catch(() => undefined);

    void announce();

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
      window.removeEventListener('pagehide', departOnce);
      window.removeEventListener('pageshow', restore);
      void withRetry(() => send(false, true)).catch(() => undefined);
    };
  }, [accountKey, admitted, connectionId, queryClient, roomId]);

  return { connectionId };
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
