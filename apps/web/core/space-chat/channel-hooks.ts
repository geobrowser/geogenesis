'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { GeoChatRequestError, dashlessId } from '~/core/debates/api';

import {
  type SpaceChannelSettings,
  type SpaceChatAuth,
  type SpaceChatRoom,
  changeSpaceChannelMembers,
  createSpaceChannel,
  listSpaceChannelMembers,
  markSpaceChatRoomRead,
  updateSpaceChannel,
} from './api';
import { useSpaceChatAuth } from './hooks';
import { type SpaceChatRoomsData, sameMessageId, spaceChatQueryKeys, withChannelUpdate } from './state';

function signInError() {
  return new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
}

/** A write's response carries no viewer fields; the editor who created a channel can post and moderate it. */
const CREATOR_VIEW = {
  can_post: true,
  can_reply: true,
  can_moderate: true,
  unread_count: 0,
} satisfies Partial<SpaceChatRoom>;

/** A written room laid into a cached list: merged over its row, added, or dropped once archived. */
export function withWrittenRoom(
  current: SpaceChatRoomsData,
  room: SpaceChatRoom,
  listsArchived: boolean
): SpaceChatRoomsData {
  const held = current.rooms.some(row => sameMessageId(row.id, room.id));
  const next = held
    ? withChannelUpdate(current, room)
    : { ...current, rooms: [...current.rooms, { ...CREATOR_VIEW, ...room }] };
  if (listsArchived) return next;
  return { ...next, rooms: next.rooms.filter(row => !(sameMessageId(row.id, room.id) && row.archived)) };
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

/** A shown channel's read cursor is written this long after its newest message, at most. */
export const READ_CURSOR_DELAY_MS = 5_000;

type ReadCursor = { roomId: string; messageId: string; auth: SpaceChatAuth };

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function usePageVisible() {
  return React.useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'visible',
    () => false
  );
}

/** Clears a shown channel's badge at once; the cursor write trails, or goes when the tab hides or the channel closes. */
export function useMarkChannelRead(room: SpaceChatRoom | null, newestId: string | null, showing: boolean) {
  const { auth } = useSpaceChatAuth();
  const queryClient = useQueryClient();
  const visible = usePageVisible();
  const pending = React.useRef<ReadCursor | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomId = room?.id ?? null;
  const spaceId = room?.space_id ?? null;
  const lastRead = room?.last_read_message_id ?? null;

  const flush = React.useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const cursor = pending.current;
    pending.current = null;
    // Geo-chat never moves the cursor back; a failure shows again on the next list read.
    if (cursor) markSpaceChatRoomRead(cursor.roomId, cursor.messageId, cursor.auth).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!auth || !roomId || !spaceId || !newestId || !showing || !visible) return;
    if (lastRead && dashlessId(lastRead) >= dashlessId(newestId)) return;
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
    pending.current = { roomId, messageId: newestId, auth };
    timer.current ??= setTimeout(flush, READ_CURSOR_DELAY_MS);
  }, [auth, flush, lastRead, newestId, queryClient, roomId, showing, spaceId, visible]);

  // Hiding or leaving the tab, or another channel, writes what is pending now.
  React.useEffect(() => {
    if (!visible) flush();
  }, [flush, visible]);
  React.useEffect(() => {
    window.addEventListener('blur', flush);
    return () => window.removeEventListener('blur', flush);
  }, [flush]);
  React.useEffect(() => flush, [flush, roomId]);
}
