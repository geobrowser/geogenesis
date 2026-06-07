import type { GeoChatMessage, ListMessagesResponse, SpaceRoom } from './api';

const GATEWAY_PROTOCOL_VERSION = 1;

export type MessagesQueryKey = readonly ['space-chat', 'messages', string];

export type GeoChatGatewayOp =
  | 'HELLO'
  | 'READY'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'MESSAGE_CREATE'
  | 'EVENT'
  | 'HEARTBEAT'
  | 'HEARTBEAT_ACK'
  | 'RESUME'
  | 'ERROR';

export type GeoChatGatewayEnvelope<TPayload = unknown> = {
  v: number;
  op: GeoChatGatewayOp;
  seq: number | null;
  request_id: string | null;
  space_id: string | null;
  room_id: string | null;
  room_kind: SpaceRoom['kind'] | null;
  payload: TPayload;
};

type GatewayMessagePayload = {
  type?: unknown;
  message?: GeoChatMessage;
  message_id?: unknown;
  body?: unknown;
  edited_at?: unknown;
  deleted_at?: unknown;
};

type GatewayErrorPayload = {
  code?: unknown;
  message?: unknown;
};

export type GatewayMessageReconciliation = {
  next: ListMessagesResponse | undefined;
  shouldRefetch: boolean;
};

export function createSubscribeEnvelope({
  spaceId,
  room,
  resumeAfterSeq = null,
}: {
  spaceId: string;
  room: SpaceRoom;
  resumeAfterSeq?: number | null;
}): GeoChatGatewayEnvelope {
  return {
    v: GATEWAY_PROTOCOL_VERSION,
    op: 'SUBSCRIBE',
    seq: null,
    request_id: createGatewayRequestId('subscribe'),
    space_id: spaceId,
    room_id: room.id,
    room_kind: room.kind,
    payload: {
      space_id: spaceId,
      room_id: room.id,
      room_kind: room.kind,
      resume_after_seq: resumeAfterSeq,
    },
  };
}

export function createHeartbeatEnvelope(seq: number | null): GeoChatGatewayEnvelope {
  return {
    v: GATEWAY_PROTOCOL_VERSION,
    op: 'HEARTBEAT',
    seq,
    request_id: createGatewayRequestId('heartbeat'),
    space_id: null,
    room_id: null,
    room_kind: null,
    payload: {},
  };
}

export function createMessagesQueryKey(roomId: string | null | undefined): MessagesQueryKey {
  return ['space-chat', 'messages', roomId ?? 'none'] as const;
}

export function reconcileGatewayEnvelope(
  current: ListMessagesResponse | undefined,
  envelope: GeoChatGatewayEnvelope
): GatewayMessageReconciliation {
  if (isLaggedError(envelope)) {
    return { next: current, shouldRefetch: true };
  }

  if (envelope.op !== 'EVENT') {
    return { next: current, shouldRefetch: false };
  }

  const event = unwrapMessageEventPayload(envelope.payload);
  if (!event) {
    return { next: current, shouldRefetch: true };
  }

  const message = event.payload.message ?? findMessagePayload(envelope.payload);
  if (message) {
    return { next: appendMessage(current, message), shouldRefetch: false };
  }

  if (isMessageEventKind(event, 'created')) {
    return { next: current, shouldRefetch: true };
  }

  if (isMessageEventKind(event, 'edited')) {
    const messageId = stringValue(event.payload.message_id);
    const body = stringValue(event.payload.body);
    const editedAt = stringValue(event.payload.edited_at);
    if (!messageId || body === null || !editedAt) return { next: current, shouldRefetch: true };
    return updateMessage(current, messageId, message => ({ ...message, body, edited_at: editedAt }));
  }

  if (isMessageEventKind(event, 'deleted')) {
    const messageId = stringValue(event.payload.message_id);
    const deletedAt = stringValue(event.payload.deleted_at);
    if (!messageId || !deletedAt) return { next: current, shouldRefetch: true };
    return updateMessage(current, messageId, message => ({ ...message, deleted_at: deletedAt }));
  }

  return { next: current, shouldRefetch: true };
}

export function appendMessage(
  current: ListMessagesResponse | undefined,
  message: GeoChatMessage
): ListMessagesResponse {
  if (!current) {
    return { messages: [message], next_before: null };
  }

  const messageId = normalizeMessageId(message.id);
  const messages = current.messages.some(
    item => normalizeMessageId(item.id) === messageId || item.client_nonce === message.client_nonce
  )
    ? current.messages.map(item =>
        normalizeMessageId(item.id) === messageId || item.client_nonce === message.client_nonce ? message : item
      )
    : [...current.messages, message];

  return {
    ...current,
    messages,
  };
}

function updateMessage(
  current: ListMessagesResponse | undefined,
  messageId: string,
  updater: (message: GeoChatMessage) => GeoChatMessage
): GatewayMessageReconciliation {
  if (!current) {
    return { next: current, shouldRefetch: true };
  }

  let didUpdate = false;
  const normalizedMessageId = normalizeMessageId(messageId);
  const messages = current.messages.map(message => {
    if (normalizeMessageId(message.id) !== normalizedMessageId) return message;
    didUpdate = true;
    return updater(message);
  });

  return {
    next: didUpdate ? { ...current, messages } : current,
    shouldRefetch: !didUpdate,
  };
}

function isLaggedError(envelope: GeoChatGatewayEnvelope) {
  if (envelope.op !== 'ERROR') return false;
  const payload = envelope.payload as GatewayErrorPayload;
  return payload.code === 'events_lagged';
}

function unwrapMessageEventPayload(payload: unknown) {
  if (!isRecord(payload)) return null;

  const nested = isRecord(payload.payload) ? payload.payload : payload;

  return {
    eventType: eventKind(payload.event_type),
    type: eventKind(nested.type),
    payload: nested as GatewayMessagePayload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function findMessagePayload(value: unknown, depth = 0): GeoChatMessage | null {
  if (depth > 4 || !isRecord(value)) return null;

  const message = value.message;
  if (isGeoChatMessage(message)) return message;

  const nested = value.payload;
  return nested ? findMessagePayload(nested, depth + 1) : null;
}

function isGeoChatMessage(value: unknown): value is GeoChatMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.room_id === 'string' &&
    typeof value.room_kind === 'string' &&
    typeof value.author_id === 'string' &&
    typeof value.client_nonce === 'string' &&
    typeof value.body === 'string' &&
    typeof value.created_at === 'string'
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function eventKind(value: unknown) {
  return typeof value === 'string' ? value.toLowerCase() : null;
}

function isMessageEventKind(
  event: { eventType: string | null; type: string | null },
  kind: 'created' | 'edited' | 'deleted'
) {
  return [event.eventType, event.type].some(value => normalizedEventKind(value).endsWith(`message${kind}`) || value === kind);
}

function normalizedEventKind(value: string | null) {
  return value?.replaceAll(/[^a-z0-9]/g, '') ?? '';
}

function normalizeMessageId(value: string) {
  return value.replaceAll('-', '').toLowerCase();
}

function createGatewayRequestId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
