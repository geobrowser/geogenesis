'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type ListMessagesResponse, type SpaceRoom, getGeoChatWebSocketUrl } from './api';
import {
  type GeoChatGatewayEnvelope,
  type MessagesQueryKey,
  createHeartbeatEnvelope,
  createSubscribeEnvelope,
  reconcileGatewayEnvelope,
} from './gateway';

type UseSpaceChatGatewayArgs = {
  spaceId: string;
  room: SpaceRoom | null;
  accessToken: string | null;
  messagesKey: MessagesQueryKey;
};

const FALLBACK_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 10_000;

export function useSpaceChatGateway({ spaceId, room, accessToken, messagesKey }: UseSpaceChatGatewayArgs) {
  const queryClient = useQueryClient();
  const roomId = room?.id ?? null;
  const roomKind = room?.kind ?? null;
  const socketAccessToken = getGatewaySocketAccessToken(roomKind, accessToken);
  const socketUrl = React.useMemo(() => {
    if (!roomId || !roomKind) return null;
    return getGeoChatWebSocketUrl({ accessToken: socketAccessToken });
  }, [roomId, roomKind, socketAccessToken]);

  React.useEffect(() => {
    gatewayLog('hook state', {
      spaceId,
      roomId,
      roomKind,
      auth: socketAccessToken ? 'token' : 'anonymous',
      socketUrl: socketUrl ? redactAccessToken(socketUrl) : null,
      messagesKey,
    });
  }, [messagesKey, roomId, roomKind, socketAccessToken, socketUrl, spaceId]);

  React.useEffect(() => {
    if (!roomId || !roomKind || !socketUrl) {
      gatewayLog('waiting for room', { spaceId, auth: socketAccessToken ? 'token' : 'anonymous', messagesKey });
      return;
    }

    const activeRoom: SpaceRoom = {
      id: roomId,
      kind: roomKind,
      public_dao_space_id: room?.public_dao_space_id ?? '',
      space_id: room?.space_id ?? spaceId,
      key: room?.key ?? `${spaceId}::${roomKind}`,
    };
    let socket: WebSocket | null = null;
    let heartbeatTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let subscribeSent = false;
    let hasConnected = false;
    let reconnectAttempt = 0;
    let lastSeq: number | null = null;

    const clearHeartbeat = () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    };

    const startHeartbeat = (intervalMs: number) => {
      clearHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify(createHeartbeatEnvelope(lastSeq)));
      }, intervalMs);
    };

    const reconcileHistory = (reason: string) => {
      gatewayLog('invalidate history', { reason, roomId: activeRoom.id, messagesKey });
      void queryClient.invalidateQueries({ queryKey: messagesKey });
    };

    const sendSubscribe = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN || subscribeSent) return;
      subscribeSent = true;
      const envelope = createSubscribeEnvelope({ spaceId, room: activeRoom, resumeAfterSeq: lastSeq });
      socket.send(JSON.stringify(envelope));
      gatewayLog('sent SUBSCRIBE', {
        requestId: envelope.request_id,
        roomId: normalizeId(activeRoom.id),
        roomKind: activeRoom.kind,
        spaceId,
        resumeAfterSeq: lastSeq,
      });
    };

    const scheduleReconnect = (reason: string) => {
      if (closed) return;

      clearHeartbeat();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);

      const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
      reconnectAttempt += 1;
      gatewayLog('schedule reconnect', { reason, delay, reconnectAttempt, roomId: activeRoom.id });
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const handleEnvelope = (envelope: GeoChatGatewayEnvelope) => {
      if (typeof envelope.seq === 'number') {
        lastSeq = envelope.seq;
      }

      gatewayLog('received frame', summarizeEnvelope(envelope, activeRoom.id));

      if (envelope.op === 'HELLO') {
        const heartbeatIntervalMs = heartbeatIntervalFromPayload(envelope.payload);
        gatewayLog('start heartbeat', { heartbeatIntervalMs, roomId: activeRoom.id });
        startHeartbeat(heartbeatIntervalMs);
        return;
      }

      if (envelope.op === 'READY') {
        const subscriptions = subscriptionsFromReady(envelope.payload);
        const targetRoomSubscribed = subscriptions.some(subscription => subscription.roomId === normalizeId(activeRoom.id));
        gatewayLog('READY subscriptions', {
          roomId: activeRoom.id,
          subscriptions,
          targetRoomSubscribed,
        });
        sendSubscribe();
        return;
      }

      let shouldRefetch = false;
      queryClient.setQueryData<ListMessagesResponse>(messagesKey, current => {
        const beforeCount = current?.messages.length ?? 0;
        const reconciled = reconcileGatewayEnvelope(current, envelope);
        shouldRefetch = reconciled.shouldRefetch;
        const afterCount = reconciled.next?.messages.length ?? 0;
        gatewayLog('reconciled frame', {
          ...summarizeEnvelope(envelope, activeRoom.id),
          beforeCount,
          afterCount,
          shouldRefetch,
        });
        return reconciled.next;
      });

      if (shouldRefetch) {
        reconcileHistory(`gateway ${envelope.op}`);
      }
    };

    function connect() {
      if (closed) return;

      subscribeSent = false;
      gatewayLog('connect', {
        url: redactAccessToken(socketUrl),
        roomId: activeRoom.id,
        auth: socketAccessToken ? 'token' : 'anonymous',
      });
      socket = new WebSocket(socketUrl);

      socket.addEventListener('open', () => {
        if (closed) return;
        gatewayLog('open', { roomId: activeRoom.id, upgrade: '101 implied by browser open event' });
        if (hasConnected) reconcileHistory('reconnected');
        hasConnected = true;
        reconnectAttempt = 0;
      });

      socket.addEventListener('message', event => {
        if (closed) return;
        const envelope = parseGatewayEnvelope(event.data);
        if (!envelope) {
          gatewayLog('ignored unparsable frame', {
            roomId: activeRoom.id,
            dataType: typeof event.data,
            preview: typeof event.data === 'string' ? event.data.slice(0, 240) : null,
          });
          return;
        }
        handleEnvelope(envelope);
      });

      socket.addEventListener('close', event => {
        if (closed) return;
        gatewayLog('close', {
          roomId: activeRoom.id,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        scheduleReconnect(`close:${event.code}`);
      });

      socket.addEventListener('error', () => {
        if (closed) return;
        gatewayLog('error', { roomId: activeRoom.id });
        socket?.close();
      });
    }

    connect();

    return () => {
      closed = true;
      gatewayLog('cleanup', { roomId: activeRoom.id });
      clearHeartbeat();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [
    messagesKey,
    queryClient,
    room?.key,
    room?.public_dao_space_id,
    room?.space_id,
    roomId,
    roomKind,
    socketAccessToken,
    socketUrl,
    spaceId,
  ]);

}

export function getGatewaySocketAccessToken(roomKind: SpaceRoom['kind'] | null, accessToken: string | null) {
  return roomKind === 'editor' ? accessToken : null;
}

export function parseGatewayEnvelope(data: unknown): GeoChatGatewayEnvelope | null {
  if (typeof data !== 'string') return null;

  try {
    const parsed = JSON.parse(data) as Partial<GeoChatGatewayEnvelope>;
    if (typeof parsed.op !== 'string') return null;
    if (parsed.v !== undefined && parsed.v !== 1) return null;
    return {
      v: 1,
      seq: null,
      request_id: null,
      space_id: null,
      room_id: null,
      room_kind: null,
      payload: {},
      ...parsed,
    } as GeoChatGatewayEnvelope;
  } catch {
    return null;
  }
}

function heartbeatIntervalFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return FALLBACK_HEARTBEAT_INTERVAL_MS;
  const heartbeatIntervalMs = (payload as { heartbeat_interval_ms?: unknown }).heartbeat_interval_ms;
  return typeof heartbeatIntervalMs === 'number' && heartbeatIntervalMs > 0
    ? heartbeatIntervalMs
    : FALLBACK_HEARTBEAT_INTERVAL_MS;
}

function gatewayLog(message: string, details: Record<string, unknown>) {
  if (!isGatewayLoggingEnabled()) return;
  console.log(`[geo-chat:ws] ${message}`, details);
}

function isGatewayLoggingEnabled() {
  return process.env.NEXT_PUBLIC_GEO_CHAT_DEBUG === '1';
}

function summarizeEnvelope(envelope: GeoChatGatewayEnvelope, targetRoomId: string) {
  const eventPayload = eventPayloadFromEnvelope(envelope);

  return {
    op: envelope.op,
    seq: envelope.seq,
    roomId: normalizeOptionalId(envelope.room_id),
    targetRoomId: normalizeId(targetRoomId),
    roomMatchesTarget: normalizeOptionalId(envelope.room_id) === normalizeId(targetRoomId),
    eventType: eventTypeFromPayload(envelope.payload),
    payloadType: eventPayload?.type ?? null,
    messageId: normalizeOptionalId(eventPayload?.message?.id ?? eventPayload?.message_id),
    clientNonce: eventPayload?.message?.client_nonce ?? null,
    authorId: normalizeOptionalId(eventPayload?.message?.author_id),
    hasMessage: Boolean(eventPayload?.message),
    errorCode: errorCodeFromPayload(envelope.payload),
  };
}

function subscriptionsFromReady(payload: unknown) {
  if (!payload || typeof payload !== 'object') return [];
  const subscriptions = (payload as { subscriptions?: unknown }).subscriptions;
  if (!Array.isArray(subscriptions)) return [];

  return subscriptions.map(subscription => {
    if (!subscription || typeof subscription !== 'object') {
      return { roomId: null, roomKind: null, spaceId: null };
    }

    const typed = subscription as { room_id?: unknown; room_kind?: unknown; space_id?: unknown };
    return {
      roomId: normalizeOptionalId(typed.room_id),
      roomKind: typeof typed.room_kind === 'string' ? typed.room_kind : null,
      spaceId: typeof typed.space_id === 'string' ? typed.space_id : null,
    };
  });
}

function eventPayloadFromEnvelope(envelope: GeoChatGatewayEnvelope) {
  const payload = envelope.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const nested = (payload as { payload?: unknown }).payload;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as {
      type?: unknown;
      message?: { id?: unknown; client_nonce?: unknown; author_id?: unknown };
      message_id?: unknown;
    };
  }

  return payload as {
    type?: unknown;
    message?: { id?: unknown; client_nonce?: unknown; author_id?: unknown };
    message_id?: unknown;
  };
}

function eventTypeFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const eventType = (payload as { event_type?: unknown }).event_type;
  return typeof eventType === 'string' ? eventType : null;
}

function errorCodeFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const code = (payload as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function normalizeOptionalId(value: unknown) {
  return typeof value === 'string' ? normalizeId(value) : null;
}

function normalizeId(value: string) {
  return value.replaceAll('-', '').toLowerCase();
}

function redactAccessToken(url: string) {
  const parsed = new URL(url);
  if (parsed.searchParams.has('access_token')) {
    parsed.searchParams.set('access_token', '[redacted]');
  }
  return parsed.toString();
}
