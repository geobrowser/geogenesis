'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useParticipantAvatars, withRowParticipantAvatars } from '~/core/debates/participant-avatars';
import { withQueryData } from '~/core/debates/with-query-data';

import { type DebateRoom, type DebateRoomParticipant, getDebateRoom, joinDebateRoom, leaveDebateRoom } from '../api';
import { useDebateVisibility } from '../debate-attention';
import { debateQueryKeys, debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { debateRoomPresence } from './room-presence';

/**
 * Bounds the case where the gateway's room events never arrive. Tighter than the rematch's 5s: a
 * missed push here leaves a viewer on "waiting" while their opponent is already in the room.
 */
const ROOM_POLL_MS = 3_000;

/** Stable empty reference, so an unresolved room query does not rebuild the memos below. */
const EMPTY_ROOM_PARTICIPANTS: DebateRoomParticipant[] = [];

export function useDebateRoom(roomId: string, enabled = true) {
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  // Visibility rather than attention, as the rematch query uses: waiting for someone while looking
  // at another window is exactly this flow, and attention additionally wants `document.hasFocus()`.
  const present = useDebateVisibility();

  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: debateQueryKeys.room(accountKey, roomId),
    queryFn: ({ signal }) => getDebateRoom(roomId, getPrivyIdentityToken, accountKey, signal),
    enabled: enabled && Boolean(roomId),
    refetchInterval: present ? ROOM_POLL_MS : false,
  });

  const participants = React.useMemo(() => query.data?.participants ?? EMPTY_ROOM_PARTICIPANTS, [query.data]);
  const withAvatar = useParticipantAvatars(participants, enabled && Boolean(roomId));

  const data = React.useMemo(
    () => (query.data ? withRowParticipantAvatars(query.data, withAvatar) : query.data),
    [query.data, withAvatar]
  );

  return withQueryData(query, data);
}

/**
 * Ticks as well as reading each payload: two states turn on a deadline passing rather than on
 * anything the server pushes, and would otherwise sit stale until the next poll landed.
 */
export function useDebateRoomPresence(room: DebateRoom | null | undefined) {
  const currentUserId = useCurrentGeoChatUserId();
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  return React.useMemo(() => debateRoomPresence({ room, currentUserId, now }), [room, currentUserId, now]);
}

export function useJoinDebateRoom(roomId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => joinDebateRoom(roomId, getPrivyIdentityToken, accountKey),
    onSuccess: room => queryClient.setQueryData(debateQueryKeys.room(accountKey, room.id), room),
  });
}

/** Per person, unlike `useLeaveDebateRematch`: the room stays open and the rejoin available. */
export function useLeaveDebateRoom(roomId: string) {
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();

  return useMutation({
    mutationFn: () => leaveDebateRoom(roomId, getPrivyIdentityToken, accountKey),
    onSuccess: room => queryClient.setQueryData(debateQueryKeys.room(accountKey, room.id), room),
  });
}
