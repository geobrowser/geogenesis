import type { QueryKey } from '@tanstack/react-query';

import { dashlessId } from '~/core/debates/api';

import type { SpaceChatMessage, SpaceChatPage, SpaceChatReaction } from './api';

/** A send not yet confirmed by geo-chat; matched to the stored message by `client_nonce`. */
export type PendingSpaceChatMessage = {
  client_nonce: string;
  body: string;
  reply_to_message_id: string | null;
  created_at: string;
};

/** One room as cached: every message loaded, newest first, by id. */
export type SpaceChatState = {
  messages: SpaceChatMessage[];
  /** Where the next older page starts; `null` once the start is loaded. */
  nextBefore: string | null;
  pending: PendingSpaceChatMessage[];
};

export const spaceChatQueryKeys = {
  /** Signed in: under the account, so the gateway patches it and its broad reconcile refetches it. */
  account: (accountKey: string, roomId: string): QueryKey => [
    'debates',
    'account',
    accountKey,
    'space-chat',
    dashlessId(roomId),
  ],
  /** Signed out: polled. */
  public: (roomId: string): QueryKey => ['space-chat-public', dashlessId(roomId)],
  rooms: (spaceId: string, accountKey: string | null): QueryKey =>
    accountKey ? ['debates', 'account', accountKey, 'space-chat-rooms', spaceId] : ['space-chat-rooms', spaceId],
};

export function sameMessageId(a: string, b: string) {
  return dashlessId(a) === dashlessId(b);
}

/** Of two copies of one message, the later: a delete beats everything, then the later edit. */
function laterCopy(known: SpaceChatMessage, incoming: SpaceChatMessage) {
  if (known.deleted_at || incoming.deleted_at) return known.deleted_at ? known : incoming;
  if (known.edited_at && (!incoming.edited_at || Date.parse(known.edited_at) > Date.parse(incoming.edited_at))) {
    // The stored edit is newer; reactions are only ever newer on the incoming copy.
    return { ...known, reactions: incoming.reactions ?? known.reactions };
  }
  return incoming;
}

function byIdNewestFirst(a: SpaceChatMessage, b: SpaceChatMessage) {
  const left = dashlessId(a.id);
  const right = dashlessId(b.id);
  return left < right ? 1 : left > right ? -1 : 0;
}

function upsertAll(messages: SpaceChatMessage[], incoming: SpaceChatMessage[]) {
  const byId = new Map(messages.map(message => [dashlessId(message.id), message]));
  for (const message of incoming) {
    const id = dashlessId(message.id);
    const known = byId.get(id);
    byId.set(id, known ? laterCopy(known, message) : message);
  }
  return [...byId.values()].sort(byIdNewestFirst);
}

function settlePending(pending: PendingSpaceChatMessage[], messages: SpaceChatMessage[]) {
  if (pending.length === 0) return pending;
  const nonces = new Set(messages.map(message => message.client_nonce));
  const left = pending.filter(entry => !nonces.has(entry.client_nonce));
  return left.length === pending.length ? pending : left;
}

/**
 * The newest page laid over what is cached: older pages already loaded stay, and `nextBefore`
 * stays the oldest loaded. A page's reactions carry the viewer's own `reacted`, so they win.
 */
export function withChatPage(current: SpaceChatState | undefined, page: SpaceChatPage): SpaceChatState {
  const nextBefore = page.next_before?.before_message_id ?? null;
  if (!current) {
    return { messages: [...page.messages].sort(byIdNewestFirst), nextBefore, pending: [] };
  }
  const newestCached = current.messages[0];
  const oldestRead = page.messages.at(-1);
  if (
    nextBefore !== null &&
    newestCached !== undefined &&
    oldestRead !== undefined &&
    dashlessId(oldestRead.id) > dashlessId(newestCached.id)
  ) {
    // A full page newer than everything cached leaves a gap: start over from this page.
    const messages = [...page.messages].sort(byIdNewestFirst);
    return { messages, nextBefore, pending: settlePending(current.pending, messages) };
  }
  const messages = upsertAll(current.messages, page.messages);
  const oldestCached = current.messages.at(-1);
  const olderLoaded =
    oldestCached !== undefined && (oldestRead === undefined || dashlessId(oldestCached.id) < dashlessId(oldestRead.id));
  return {
    messages,
    nextBefore: olderLoaded ? current.nextBefore : nextBefore,
    pending: settlePending(current.pending, messages),
  };
}

export function withOlderChatPage(current: SpaceChatState, page: SpaceChatPage): SpaceChatState {
  return {
    ...current,
    messages: upsertAll(current.messages, page.messages),
    nextBefore: page.next_before?.before_message_id ?? null,
  };
}

/** A write's own response, or `message.created`: added if new, else the later copy kept. */
export function withChatMessage(current: SpaceChatState, message: SpaceChatMessage): SpaceChatState {
  // `message.created` and a POST answer carry `reactions: []`; an existing copy keeps its own.
  const known = current.messages.find(item => sameMessageId(item.id, message.id));
  const incoming = known && message.reactions?.length === 0 ? { ...message, reactions: known.reactions } : message;
  const messages = upsertAll(current.messages, [incoming]);
  return { ...current, messages, pending: settlePending(current.pending, [message]) };
}

export function withPendingMessage(current: SpaceChatState, pending: PendingSpaceChatMessage): SpaceChatState {
  return { ...current, pending: [...current.pending, pending] };
}

export function withoutPendingMessage(current: SpaceChatState, clientNonce: string): SpaceChatState {
  return { ...current, pending: current.pending.filter(entry => entry.client_nonce !== clientNonce) };
}

function patchMessage(
  current: SpaceChatState,
  messageId: string,
  change: (message: SpaceChatMessage) => SpaceChatMessage
): SpaceChatState {
  let changed = false;
  const messages = current.messages.map(message => {
    if (!sameMessageId(message.id, messageId)) return message;
    const next = change(message);
    if (next !== message) changed = true;
    return next;
  });
  return changed ? { ...current, messages } : current;
}

/** A room event, as `message.edited`, `message.deleted` and `message.reaction_changed` carry it. */
export type SpaceChatRoomEvent =
  | { type: 'created'; message: SpaceChatMessage }
  | { type: 'edited'; messageId: string; body: string; editedAt: string }
  | { type: 'deleted'; messageId: string; deletedAt: string }
  | { type: 'reaction'; messageId: string; userId: string; value: string; count: number; added: boolean };

/** `viewerId` decides `reacted` on the viewer's own reaction events; every other field is shared. */
export function withRoomEvent(
  current: SpaceChatState,
  event: SpaceChatRoomEvent,
  viewerId: string | null
): SpaceChatState {
  switch (event.type) {
    case 'created':
      return withChatMessage(current, event.message);
    case 'edited':
      return patchMessage(current, event.messageId, message =>
        message.deleted_at || (message.edited_at !== null && Date.parse(message.edited_at) > Date.parse(event.editedAt))
          ? message
          : { ...message, body: event.body, edited_at: event.editedAt }
      );
    case 'deleted':
      return patchMessage(current, event.messageId, message => redacted(message, event.deletedAt));
    case 'reaction':
      return patchMessage(current, event.messageId, message =>
        message.deleted_at
          ? message
          : {
              ...message,
              reactions: withReactionCount(message.reactions ?? [], event, viewerId),
            }
      );
  }
}

export function redacted(message: SpaceChatMessage, deletedAt: string): SpaceChatMessage {
  return { ...message, body: '', attachment_ids: [], reactions: [], deleted_at: message.deleted_at ?? deletedAt };
}

function withReactionCount(
  reactions: SpaceChatReaction[],
  event: { userId: string; value: string; count: number; added: boolean },
  viewerId: string | null
): SpaceChatReaction[] {
  const own = viewerId !== null && dashlessId(viewerId) === dashlessId(event.userId);
  const index = reactions.findIndex(reaction => reaction.value === event.value);
  if (event.count <= 0) return index === -1 ? reactions : reactions.filter((_, at) => at !== index);
  if (index === -1) return [...reactions, { value: event.value, count: event.count, reacted: own && event.added }];
  return reactions.map((reaction, at) =>
    at === index ? { ...reaction, count: event.count, reacted: own ? event.added : reaction.reacted } : reaction
  );
}

/** The viewer's own reaction, applied before the server answers. */
export function withOwnReaction(
  current: SpaceChatState,
  messageId: string,
  value: string,
  added: boolean
): SpaceChatState {
  return patchMessage(current, messageId, message => {
    const reactions = message.reactions ?? [];
    const known = reactions.find(reaction => reaction.value === value);
    if (known && known.reacted === added) return message;
    const count = (known?.count ?? 0) + (added ? 1 : -1);
    return {
      ...message,
      reactions: withReactionCount(reactions, { userId: 'self', value, count, added }, 'self'),
    };
  });
}

/** The geo-chat EVENT envelope's `payload` for a room event; `null` when unreadable or unknown. */
export function parseSpaceChatRoomEvent(payload: unknown): SpaceChatRoomEvent | null {
  if (!isRecord(payload) || typeof payload.event_type !== 'string' || !isRecord(payload.payload)) return null;
  const body = payload.payload;
  switch (payload.event_type) {
    case 'message.created': {
      const message = body.message;
      if (!isRecord(message) || typeof message.id !== 'string' || typeof message.created_at !== 'string') return null;
      if (typeof message.author_id !== 'string' || typeof message.body !== 'string') return null;
      return { type: 'created', message: message as unknown as SpaceChatMessage };
    }
    case 'message.edited':
      if (typeof body.message_id !== 'string' || typeof body.body !== 'string') return null;
      if (typeof body.edited_at !== 'string') return null;
      return { type: 'edited', messageId: body.message_id, body: body.body, editedAt: body.edited_at };
    case 'message.deleted':
      if (typeof body.message_id !== 'string' || typeof body.deleted_at !== 'string') return null;
      return { type: 'deleted', messageId: body.message_id, deletedAt: body.deleted_at };
    case 'message.reaction_changed':
      if (typeof body.message_id !== 'string' || typeof body.user_id !== 'string') return null;
      if (typeof body.value !== 'string' || typeof body.count !== 'number' || typeof body.added !== 'boolean') {
        return null;
      }
      return {
        type: 'reaction',
        messageId: body.message_id,
        userId: body.user_id,
        value: body.value,
        count: body.count,
        added: body.added,
      };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
