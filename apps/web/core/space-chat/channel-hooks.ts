'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { GeoChatRequestError, dashlessId } from '~/core/debates/api';

import {
  type SpaceChannelSettings,
  type SpaceChatRoom,
  changeSpaceChannelMembers,
  createSpaceChannel,
  listSpaceChannelMembers,
  markSpaceChatRoomRead,
  updateSpaceChannel,
} from './api';
import { useSpaceChatAuth } from './hooks';
import { type SpaceChatRoomsData, sameMessageId, spaceChatQueryKeys } from './state';

function signInError() {
  return new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
}

/** A written room laid into every cached list of its space: replaced, added, or dropped once archived. */
function withWrittenRoom(current: SpaceChatRoomsData, room: SpaceChatRoom, listsArchived: boolean): SpaceChatRoomsData {
  const rest = current.rooms.filter(held => !sameMessageId(held.id, room.id));
  if (room.archived && !listsArchived) return { ...current, rooms: rest };
  const index = current.rooms.findIndex(held => sameMessageId(held.id, room.id));
  if (index === -1) return { ...current, rooms: [...rest, room] };
  const rooms = [...current.rooms];
  rooms[index] = room;
  return { ...current, rooms };
}

/** Editors' channel writes (GEO-3818). Each rejects with geo-chat's error. */
export function useSpaceChannelWrites(spaceId: string) {
  const { auth } = useSpaceChatAuth();
  const queryClient = useQueryClient();

  const applyRoom = React.useCallback(
    (room: SpaceChatRoom) => {
      const root = spaceChatQueryKeys.roomsRoot(spaceId, auth?.accountKey ?? null);
      for (const [key, data] of queryClient.getQueriesData<SpaceChatRoomsData>({ queryKey: root })) {
        if (!data) continue;
        queryClient.setQueryData(key, withWrittenRoom(data, room, key.at(-1) === 'archived'));
      }
      void queryClient.invalidateQueries({ queryKey: root });
    },
    [auth?.accountKey, queryClient, spaceId]
  );

  const create = React.useCallback(
    async (settings: SpaceChannelSettings, memberIds: string[]) => {
      if (!auth) throw signInError();
      const room = await createSpaceChannel(
        spaceId,
        { ...settings, member_ids: settings.read_policy === 'invited' ? memberIds : [] },
        auth
      );
      applyRoom(room);
      return room;
    },
    [applyRoom, auth, spaceId]
  );

  const update = React.useCallback(
    async (roomId: string, patch: Partial<SpaceChannelSettings> & { archived?: boolean }) => {
      if (!auth) throw signInError();
      const room = await updateSpaceChannel(roomId, patch, auth);
      applyRoom(room);
      return room;
    },
    [applyRoom, auth]
  );

  return { create, update };
}

/** The people added to an invited channel; `enabled` only for one the viewer reads. */
export function useSpaceChannelMembers(roomId: string | null, enabled: boolean) {
  const { auth } = useSpaceChatAuth();
  const queryClient = useQueryClient();
  const queryKey = React.useMemo(
    () => (auth && roomId ? spaceChatQueryKeys.members(auth.accountKey, roomId) : ['space-chat-members-none']),
    [auth, roomId]
  );
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => (await listSpaceChannelMembers(roomId!, auth!, signal)).members,
    enabled: enabled && auth !== null && roomId !== null,
    staleTime: 30_000,
    retry: false,
  });

  const change = React.useCallback(
    async (userIds: string[], added: boolean) => {
      if (!auth || !roomId) throw signInError();
      const { members } = await changeSpaceChannelMembers(roomId, userIds, added, auth);
      queryClient.setQueryData(queryKey, members);
      return members;
    },
    [auth, queryClient, queryKey, roomId]
  );

  return { ...query, change };
}

/**
 * Moves the read cursor to `newestId` while the channel shows (GEO-3818), and clears its badge in
 * the cached lists at once. Each id is sent once; geo-chat never moves the cursor back.
 */
export function useMarkChannelRead(room: SpaceChatRoom | null, newestId: string | null, showing: boolean) {
  const { auth } = useSpaceChatAuth();
  const queryClient = useQueryClient();
  const sent = React.useRef<string | null>(null);
  const roomId = room?.id ?? null;
  const spaceId = room?.space_id ?? null;
  const lastRead = room?.last_read_message_id ?? null;

  React.useEffect(() => {
    if (!auth || !roomId || !spaceId || !newestId || !showing) return;
    const target = dashlessId(newestId);
    if (sent.current === target) return;
    if (lastRead && dashlessId(lastRead) >= target) return;
    sent.current = target;
    queryClient.setQueriesData<SpaceChatRoomsData>(
      { queryKey: spaceChatQueryKeys.roomsRoot(spaceId, auth.accountKey) },
      current =>
        current
          ? {
              ...current,
              rooms: current.rooms.map(held =>
                sameMessageId(held.id, roomId) ? { ...held, unread_count: 0, last_read_message_id: newestId } : held
              ),
            }
          : current
    );
    markSpaceChatRoomRead(roomId, newestId, auth).catch(() => {
      // The next room list read shows the server's count again.
      sent.current = null;
    });
  }, [auth, lastRead, newestId, queryClient, roomId, showing, spaceId]);
}
