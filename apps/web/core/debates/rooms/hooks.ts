'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type DebateRoomView, getDebateRoom, listUpcomingDebateRooms, setDebateRoomPresence } from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { debateRoomPresence } from './room-presence';

/**
 * geo-chat publishes no room event, so this poll is the mechanism rather than a backstop. Tighter
 * than the rematch's 5s because the indicator is what two people watch for each other on.
 */
const ROOM_POLL_MS = 3_000;

/** The join prompt is ambient rather than urgent, and the window it watches is minutes wide. */
const UPCOMING_ROOMS_POLL_MS = 30_000;

export function useDebateRoom(roomId: string, enabled = true) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  // Visibility rather than attention, as the rematch query uses: waiting for someone while looking
  // at another window is exactly this flow.
  const present = useDebateVisibility();

  return useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.room(accountKey, roomId),
    queryFn: ({ signal }) => getDebateRoom(roomId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(roomId),
    refetchInterval: present ? ROOM_POLL_MS : false,
  });
}

/**
 * This tab's identity, stable for the document's life. Occupancy is per connection, so a leave
 * keyed only by user would tell an opponent that someone closing a second tab had left.
 */
function useConnectionId() {
  const ref = React.useRef<string>('');
  if (!ref.current) {
    ref.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  return ref.current;
}

/**
 * Announces arrival once admitted, and departure on both exits: unmount is navigating within the
 * app, `pagehide` is closing the tab. A duplicate leave changes nothing.
 */
export function useRoomPresence(roomId: string, admitted: boolean) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const connectionId = useConnectionId();

  const send = React.useCallback(
    (joined: boolean) =>
      setDebateRoomPresence(roomId, { connection_id: connectionId, joined }, getPrivyIdentityToken, accountKey),
    [accountKey, connectionId, getPrivyIdentityToken, roomId]
  );

  const sendRef = React.useRef(send);
  sendRef.current = send;

  React.useEffect(() => {
    if (!admitted) return;

    let departed = false;
    const depart = () => {
      if (departed) return;
      departed = true;
      // Unawaited: the tab may be going away, and a leave that fails is one the sweeper's idle
      // timer reaches anyway.
      void sendRef.current(false).catch(() => {});
    };

    void sendRef
      .current(true)
      .then(room => queryClient.setQueryData(debateQueryKeys.room(accountKey, roomId), room))
      .catch(() => {
        // A refused join is reported by the room query's own `access`, which is the surface that
        // explains it. Nothing useful to add here.
      });

    window.addEventListener('pagehide', depart);
    return () => {
      window.removeEventListener('pagehide', depart);
      depart();
    };
  }, [accountKey, admitted, queryClient, roomId]);

  return { connectionId };
}

/**
 * The room's presence state, plus this visit's memory of having seen the opponent.
 *
 * The memory is what separates "they left" from "they never came": the view reports who is in the
 * room and never who has been, so without it both read the same until the grace period expires.
 */
export function useDebateRoomPresence(room: DebateRoomView | null | undefined) {
  const currentUserId = useCurrentGeoChatUserId();
  const opponentUserId =
    currentUserId && room?.access.status === 'admitted'
      ? (room.participants.find(userId => userId !== currentUserId) ?? null)
      : null;
  const opponentPresent = Boolean(opponentUserId && room?.occupants.includes(opponentUserId));

  const [sawOpponent, setSawOpponent] = React.useState(false);
  React.useEffect(() => {
    if (opponentPresent) setSawOpponent(true);
  }, [opponentPresent]);

  // Reset when the room changes, so one room's memory cannot describe another.
  const roomId = room?.room_id ?? null;
  React.useEffect(() => setSawOpponent(false), [roomId]);

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
