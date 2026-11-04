'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { GeoChatRequestError } from '~/core/debates/api';
import { useDebateVisibility } from '~/core/debates/debate-attention';
import { useSpaceChatRoomScope } from '~/core/debates/debate-gateway';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { normId } from '~/core/utils/norm-id';

import {
  type SpaceChatAuth,
  type SpaceChatMessage,
  type SpaceChatRoom,
  deleteSpaceChatMessage,
  editSpaceChatMessage,
  getSpaceChatMessages,
  listSpaceChatRooms,
  postSpaceChatMessage,
  setSpaceChatReaction,
} from './api';
import {
  type SpaceChatState,
  parseReactionCounts,
  spaceChatQueryKeys,
  withChatMessage,
  withChatPage,
  withOlderChatPage,
  withOwnReactionResult,
  withPendingMessage,
  withPendingReaction,
  withoutPendingMessage,
  withoutPendingReaction,
} from './state';

const FIRST_PAGE_LIMIT = 50;
/** A poll asks only for messages after the newest held. */
const POLL_PAGE_LIMIT = 20;
/** Polls see new messages only; edits, deletes and reactions come with a full first-page read this often. */
const POLL_FULL_READ_MS = 30_000;
/** Signed out, or signed in while the gateway is down: the same cadence as lobby guest chat. */
const POLL_VISIBLE_MS = 5_000;
/** Signed in with the gateway up, events keep it current; a remount within this reads the cache. */
const SIGNED_IN_STALE_MS = 30_000;

function useSpaceChatAuth(): { ready: boolean; auth: SpaceChatAuth | null } {
  const { ready, authenticated, accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const signedIn = authenticated && accountKey !== null;
  const auth = React.useMemo(
    () => (signedIn && accountKey ? { getPrivyIdentityToken, accountKey } : null),
    [accountKey, getPrivyIdentityToken, signedIn]
  );
  return { ready, auth };
}

/**
 * The space's chat rooms. `supported: false` for a space with no chat (geo-chat's 404 for a space
 * that is not a public DAO space), so the tab hides.
 */
export function useSpaceChatRooms(spaceId: string, enabled: boolean) {
  const { ready, auth } = useSpaceChatAuth();
  const query = useQuery({
    queryKey: spaceChatQueryKeys.rooms(spaceId, auth?.accountKey ?? null),
    queryFn: async ({ signal }) => {
      try {
        const { rooms } = await listSpaceChatRooms(spaceId, auth, signal);
        return { supported: true as const, rooms };
      } catch (error) {
        if (error instanceof GeoChatRequestError && error.status === 404) {
          return { supported: false as const, rooms: [] as SpaceChatRoom[] };
        }
        throw error;
      }
    },
    enabled: enabled && ready,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const memberRoom = query.data?.rooms.find(room => room.kind === 'member') ?? null;
  return { ...query, memberRoom };
}

export type SpaceChatRoomView = {
  state: SpaceChatState | undefined;
  status: 'loading' | 'error' | 'ready';
  refetch: () => void;
  /** Loads the next older page; absent at the start of the room. */
  loadOlder?: () => void;
  loadingOlder: boolean;
  /** Rejects with geo-chat's error; a refused post is not stored, so the same draft can be resent. */
  send: (body: string, replyTo: string | null) => Promise<void>;
  edit: (id: string, body: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  react: (id: string, value: string, added: boolean) => Promise<void>;
};

/**
 * One room's messages (GEO-3422). Signed in, the gateway's room events patch the cache; signed
 * out, or while the room is not confirmed on a ready gateway, it polls while the page is visible.
 */
export function useSpaceChatRoom(
  room: Pick<SpaceChatRoom, 'id' | 'space_id' | 'kind'> | null,
  enabled = true
): SpaceChatRoomView {
  const { ready, auth } = useSpaceChatAuth();
  const queryClient = useQueryClient();
  // A hidden tab lets the signed-out connection go after the same grace presence has.
  const visible = useDebateVisibility();
  const roomId = room?.id ?? null;
  const queryKey = React.useMemo(
    () =>
      roomId === null
        ? ['space-chat-none']
        : auth
          ? spaceChatQueryKeys.account(auth.accountKey, roomId)
          : spaceChatQueryKeys.public(roomId),
    [auth, roomId]
  );
  // Live only once this room is confirmed: a refused or pending room polls like a dropped socket.
  const live = useSpaceChatRoomScope(
    room,
    enabled && ready && (auth !== null || (visible && room?.kind === 'member')),
    auth !== null
  );
  const lastFullReadAt = React.useRef(0);

  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const newest = queryClient.getQueryData<SpaceChatState>(queryKey)?.messages[0]?.id;
      // Live events cover changes while the gateway is up, so its reconciles always read in full.
      const poll = !live && newest !== undefined && Date.now() - lastFullReadAt.current < POLL_FULL_READ_MS;
      const page = await getSpaceChatMessages(roomId!, {
        auth,
        ...(poll ? { after: newest, limit: POLL_PAGE_LIMIT } : { limit: FIRST_PAGE_LIMIT }),
        signal,
      });
      if (!poll) lastFullReadAt.current = Date.now();
      // Read once the response is in, so an event that landed meanwhile is kept.
      return withChatPage(queryClient.getQueryData<SpaceChatState>(queryKey), page);
    },
    enabled: enabled && ready && roomId !== null,
    staleTime: live ? SIGNED_IN_STALE_MS : 0,
    refetchInterval: live ? false : POLL_VISIBLE_MS,
    refetchIntervalInBackground: false,
    // Covers a tab hidden long enough for the socket to drop.
    refetchOnWindowFocus: true,
    retry: false,
  });

  const update = React.useCallback(
    (change: (state: SpaceChatState) => SpaceChatState) =>
      queryClient.setQueryData<SpaceChatState>(queryKey, current => (current ? change(current) : current)),
    [queryClient, queryKey]
  );
  const applyWrite = React.useCallback(
    (message: SpaceChatMessage) => update(state => withChatMessage(state, message)),
    [update]
  );

  // A resend of a failed send reuses its nonce, whatever was sent in between: if the first post was
  // stored after all, geo-chat returns it instead of posting twice, and charges no quota.
  const failedSends = React.useRef(new Map<string, string>());
  const send = React.useCallback(
    async (body: string, replyTo: string | null) => {
      if (!auth || !roomId) throw new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
      const key = JSON.stringify([normId(roomId), replyTo ? normId(replyTo) : null, body]);
      const clientNonce = failedSends.current.get(key) ?? newClientNonce();
      update(state =>
        withPendingMessage(state, {
          client_nonce: clientNonce,
          body,
          reply_to_message_id: replyTo,
          created_at: new Date().toISOString(),
        })
      );
      try {
        applyWrite(
          await postSpaceChatMessage(roomId, { client_nonce: clientNonce, body, reply_to_message_id: replyTo }, auth)
        );
        failedSends.current.delete(key);
      } catch (error) {
        update(state => withoutPendingMessage(state, clientNonce));
        failedSends.current.set(key, clientNonce);
        throw error;
      }
    },
    [applyWrite, auth, roomId, update]
  );
  const edit = React.useCallback(
    async (id: string, body: string) => {
      if (!auth) throw new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
      applyWrite(await editSpaceChatMessage(id, body, auth));
    },
    [applyWrite, auth]
  );
  const remove = React.useCallback(
    async (id: string) => {
      if (!auth) throw new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
      applyWrite(await deleteSpaceChatMessage(id, auth));
    },
    [applyWrite, auth]
  );
  const react = React.useCallback(
    async (id: string, value: string, added: boolean) => {
      if (!auth) throw new GeoChatRequestError('Sign in to chat', 'authentication_required', 401);
      const pending = { id: newClientNonce(), messageId: id, value, added };
      update(state => withPendingReaction(state, pending));
      try {
        const result = await setSpaceChatReaction(id, value, added, auth);
        const reactions = parseReactionCounts(result.reactions);
        update(state =>
          reactions && typeof result.reaction_version === 'number'
            ? withOwnReactionResult(state, pending, {
                value,
                added,
                reactionVersion: result.reaction_version,
                reactions,
              })
            : withoutPendingReaction(state, pending.id)
        );
      } catch (error) {
        update(state => withoutPendingReaction(state, pending.id));
        throw error;
      }
    },
    [auth, update]
  );

  const state = query.data;
  const nextBefore = state?.nextBefore ?? null;
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const loadOlder = React.useCallback(() => {
    if (!nextBefore || loadingOlder || !roomId) return;
    setLoadingOlder(true);
    getSpaceChatMessages(roomId, { before: nextBefore, auth, limit: FIRST_PAGE_LIMIT })
      .then(page => update(current => withOlderChatPage(current, page)))
      .catch(() => undefined)
      .finally(() => setLoadingOlder(false));
  }, [auth, loadingOlder, nextBefore, roomId, update]);

  const { refetch } = query;
  return {
    state,
    status: state ? 'ready' : query.isError ? 'error' : 'loading',
    refetch: React.useCallback(() => void refetch(), [refetch]),
    loadOlder: nextBefore ? loadOlder : undefined,
    loadingOlder,
    send,
    edit,
    remove,
    react,
  };
}

function newClientNonce() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `c-${crypto.randomUUID()}`
    : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
