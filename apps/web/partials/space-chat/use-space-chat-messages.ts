'use client';

import { usePrivy } from '@geogenesis/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  type GeoChatMessage,
  type ListMessagesResponse,
  type SpaceRoom,
  createRoomMessage,
  listRoomMessages,
  listSpaceRooms,
} from './api';
import { resolveGeoChatAccessToken } from './session';
import { normalizePersonId } from './space-chat-data';
import type { SpaceChatMessage, SpaceChatParticipant } from './types';

type UseSpaceChatMessagesArgs = {
  spaceId: string;
  channelId: string;
  connectedAddress: string | null;
  canPost: boolean;
};

type SendMessageArgs = {
  body: string;
  clientNonce: string;
};

export function useSpaceChatMessages({ spaceId, channelId, connectedAddress, canPost }: UseSpaceChatMessagesArgs) {
  const { ready, authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [sessionError, setSessionError] = React.useState<Error | null>(null);
  const [optimisticMessages, setOptimisticMessages] = React.useState<SpaceChatMessage[]>([]);

  React.useEffect(() => {
    if (!ready || !authenticated) {
      setAccessToken(null);
      setSessionError(null);
    }
  }, [ready, authenticated]);

  const authKey = accessToken ? 'authenticated' : 'anonymous';

  const roomsQuery = useQuery({
    queryKey: ['space-chat', 'rooms', spaceId, authKey],
    queryFn: () => listSpaceRooms(spaceId, { accessToken }),
    retry: false,
  });

  const activeRoom = React.useMemo(() => selectDefaultRoom(roomsQuery.data?.rooms ?? []), [roomsQuery.data?.rooms]);

  React.useEffect(() => {
    setOptimisticMessages([]);
  }, [activeRoom?.id]);

  const messagesKey = React.useMemo(
    () => ['space-chat', 'messages', activeRoom?.id ?? 'none', authKey] as const,
    [activeRoom?.id, authKey]
  );

  const messagesQuery = useQuery({
    queryKey: messagesKey,
    enabled: Boolean(activeRoom),
    queryFn: () => listRoomMessages({ roomId: activeRoom!.id, accessToken, limit: 50 }),
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ body, clientNonce }: SendMessageArgs) => {
      if (!activeRoom) {
        throw new Error('No chat room is available for this space.');
      }

      let token = accessToken;
      if (!token && authenticated) {
        try {
          token = await resolveGeoChatAccessToken();
          setAccessToken(token);
          setSessionError(null);
        } catch (error) {
          const sessionError = toError(error) ?? new Error('Unable to start chat session.');
          setAccessToken(null);
          setSessionError(sessionError);
          throw sessionError;
        }
      }

      if (!token) {
        throw new Error('Log in to send messages.');
      }

      return createRoomMessage({
        roomId: activeRoom.id,
        accessToken: token,
        clientNonce,
        body,
      });
    },
    onSuccess: message => {
      setOptimisticMessages(current => current.filter(item => item.clientNonce !== message.client_nonce));
      queryClient.setQueryData<ListMessagesResponse>(messagesKey, current => appendMessage(current, message));
    },
    onError: (_error, variables) => {
      setOptimisticMessages(current => current.filter(item => item.clientNonce !== variables.clientNonce));
    },
  });

  const messages = React.useMemo(() => {
    const mapped = (messagesQuery.data?.messages ?? []).map(message => toSpaceChatMessage(message, channelId));
    return sortMessages([...mapped, ...optimisticMessages]);
  }, [channelId, messagesQuery.data?.messages, optimisticMessages]);

  const sendMessage = React.useCallback(
    async (body: string) => {
      if (!activeRoom) {
        throw new Error('No chat room is available for this space.');
      }

      const clientNonce = createClientNonce();
      const pending = toPendingMessage({
        body,
        channelId,
        clientNonce,
        room: activeRoom,
        connectedAddress,
      });

      setOptimisticMessages(current => [...current, pending]);
      return sendMutation.mutateAsync({ body, clientNonce });
    },
    [activeRoom, channelId, connectedAddress, sendMutation]
  );

  const loadError = toError(roomsQuery.error ?? messagesQuery.error);
  const isLoading = roomsQuery.isLoading || messagesQuery.isLoading;
  const hasRoom = Boolean(activeRoom);
  const canSend = Boolean(hasRoom && canPost && ready && authenticated && !loadError);

  return {
    messages,
    room: activeRoom,
    isAvailable: hasRoom && !loadError,
    canSend,
    isLoading,
    isPosting: sendMutation.isPending,
    error: loadError,
    sessionError,
    postError: toError(sendMutation.error),
    disabledReason: getDisabledReason({
      canPost,
      ready,
      authenticated,
      hasRoom,
      isLoading,
      loadError,
    }),
    sendMessage,
  };
}

function selectDefaultRoom(rooms: SpaceRoom[]) {
  return rooms.find(room => room.kind === 'member') ?? rooms[0] ?? null;
}

function appendMessage(current: ListMessagesResponse | undefined, message: GeoChatMessage): ListMessagesResponse {
  if (!current) {
    return { messages: [message], next_before: null };
  }

  const messages = current.messages.some(item => item.id === message.id || item.client_nonce === message.client_nonce)
    ? current.messages.map(item =>
        item.id === message.id || item.client_nonce === message.client_nonce ? message : item
      )
    : [...current.messages, message];

  return {
    ...current,
    messages,
  };
}

function toSpaceChatMessage(message: GeoChatMessage, channelId: string): SpaceChatMessage {
  const authorId = normalizePersonId(message.author_id) ?? message.author_id;

  return {
    id: message.id,
    channelId,
    authorId,
    clientNonce: message.client_nonce,
    author: fallbackAuthor(message, authorId),
    body: message.body,
    createdAt: message.created_at,
    editedAt: message.edited_at,
    deletedAt: message.deleted_at,
  };
}

function toPendingMessage({
  body,
  channelId,
  clientNonce,
  room,
  connectedAddress,
}: {
  body: string;
  channelId: string;
  clientNonce: string;
  room: SpaceRoom;
  connectedAddress: string | null;
}): SpaceChatMessage {
  const author = pendingAuthor({ connectedAddress, room });

  return {
    id: `pending:${clientNonce}`,
    channelId,
    authorId: author.id,
    clientNonce,
    author,
    body,
    createdAt: new Date().toISOString(),
    editedAt: null,
    deletedAt: null,
    pending: true,
  };
}

function fallbackAuthor(message: GeoChatMessage, authorId: string): SpaceChatParticipant {
  return {
    id: authorId,
    spaceId: authorId,
    address: message.author_id,
    name: 'Member',
    avatarUrl: null,
    profileLink: null,
    role: message.room_kind,
    status: 'offline',
  };
}

function pendingAuthor({
  connectedAddress,
  room,
}: {
  connectedAddress: string | null;
  room: SpaceRoom;
}): SpaceChatParticipant {
  const id = connectedAddress ? `viewer:${connectedAddress.toLowerCase()}` : 'viewer:current';

  return {
    id,
    spaceId: id,
    address: connectedAddress ?? id,
    name: 'You',
    avatarUrl: null,
    profileLink: null,
    role: room.kind,
    status: 'online',
  };
}

function sortMessages(messages: SpaceChatMessage[]) {
  return [...messages].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return safeTime(aTime) - safeTime(bTime);
  });
}

function safeTime(value: number) {
  return Number.isNaN(value) ? 0 : value;
}

function createClientNonce() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toError(error: unknown): Error | null {
  if (!error) return null;
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function getDisabledReason({
  canPost,
  ready,
  authenticated,
  hasRoom,
  isLoading,
  loadError,
}: {
  canPost: boolean;
  ready: boolean;
  authenticated: boolean;
  hasRoom: boolean;
  isLoading: boolean;
  loadError: Error | null;
}) {
  if (!canPost) return 'Only space members and editors can chat';
  if (!ready) return 'Preparing chat session';
  if (!authenticated) return 'Log in to chat';
  if (loadError) return loadError.message;
  if (isLoading) return 'Loading chat';
  if (!hasRoom) return 'No chat room is available';
  return null;
}
