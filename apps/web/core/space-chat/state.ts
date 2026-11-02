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

/** The viewer's own reaction tap, shown on top of the held counts until its response settles it. */
export type PendingSpaceChatReaction = { id: string; messageId: string; value: string; added: boolean };

/** A message as held: what geo-chat sent, plus which version last set the viewer's `reacted`. */
export type HeldSpaceChatMessage = SpaceChatMessage & {
  /** The `reaction_version` of the HTTP copy the viewer's `reacted` flags came from. */
  reacted_base?: number;
  /** Per emoji, the version of the viewer's own change that last set its `reacted`. */
  own_reacted_versions?: Record<string, number>;
};

/** One room as cached: every message loaded, newest first, by id. */
export type SpaceChatState = {
  messages: HeldSpaceChatMessage[];
  /** Where the next older page starts; `null` once the start is loaded. */
  nextBefore: string | null;
  pending: PendingSpaceChatMessage[];
  /** Absent on state cached before reactions were pending. */
  pendingReactions?: PendingSpaceChatReaction[];
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

const reactionVersion = (message: SpaceChatMessage) => message.reaction_version ?? 0;

/** An HTTP copy: its `reacted` flags are the viewer's as of its own `reaction_version`. */
function heldCopy(message: SpaceChatMessage): HeldSpaceChatMessage {
  return { ...message, reacted_base: reactionVersion(message), own_reacted_versions: undefined };
}

/**
 * Of a held message and an incoming HTTP copy, the later: a delete beats everything, then the
 * later edit. Reactions come from the higher `reaction_version`, the incoming copy on a tie.
 */
function laterCopy(known: HeldSpaceChatMessage, message: SpaceChatMessage): HeldSpaceChatMessage {
  const incoming = heldCopy(message);
  if (known.deleted_at || incoming.deleted_at) return known.deleted_at ? known : incoming;
  const knownEditNewer =
    known.edited_at !== null && (!incoming.edited_at || Date.parse(known.edited_at) > Date.parse(incoming.edited_at));
  const base = knownEditNewer ? known : incoming;
  const reactionsFrom = reactionVersion(known) > reactionVersion(incoming) ? known : incoming;
  if (base === reactionsFrom) return base;
  return {
    ...base,
    reactions: reactionsFrom.reactions ?? known.reactions,
    reaction_version: reactionsFrom.reaction_version,
    reacted_base: reactionsFrom.reacted_base,
    own_reacted_versions: reactionsFrom.own_reacted_versions,
  };
}

function byIdNewestFirst(a: SpaceChatMessage, b: SpaceChatMessage) {
  const left = dashlessId(a.id);
  const right = dashlessId(b.id);
  return left < right ? 1 : left > right ? -1 : 0;
}

function upsertAll(messages: HeldSpaceChatMessage[], incoming: SpaceChatMessage[]) {
  const byId = new Map(messages.map(message => [dashlessId(message.id), message]));
  for (const message of incoming) {
    const id = dashlessId(message.id);
    const known = byId.get(id);
    byId.set(id, known ? laterCopy(known, message) : heldCopy(message));
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
    return { messages: page.messages.map(heldCopy).sort(byIdNewestFirst), nextBefore, pending: [] };
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
    const messages = page.messages.map(heldCopy).sort(byIdNewestFirst);
    return { ...current, messages, nextBefore, pending: settlePending(current.pending, messages) };
  }
  const messages = upsertAll(current.messages, page.messages);
  const oldestCached = current.messages.at(-1);
  const olderLoaded =
    oldestCached !== undefined && (oldestRead === undefined || dashlessId(oldestCached.id) < dashlessId(oldestRead.id));
  return {
    ...current,
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
  change: (message: HeldSpaceChatMessage) => HeldSpaceChatMessage
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
  | ({ type: 'reaction'; messageId: string; userId: string } & ReactionChange);

/** A reaction count as a versioned payload lists it; `reacted` only in the viewer's own response. */
export type ReactionCount = { value: string; count: number; reacted?: boolean };

/** A reaction change by one person: an event, or the viewer's own response. */
export type ReactionChange = {
  value: string;
  added: boolean;
  /** The message's `reaction_version` after the change; absent from a geo-chat without it. */
  version?: number;
  /** Every emoji's count after the change; absent from a geo-chat without it. */
  reactions?: ReactionCount[];
  /** That emoji's count, from a geo-chat without the full list. */
  count?: number;
};

function ownReactedVersion(message: HeldSpaceChatMessage, value: string) {
  return message.own_reacted_versions?.[value] ?? message.reacted_base ?? 0;
}

/**
 * Counts apply only above the held version, since events arrive out of order. `reacted` changes
 * only on the viewer's own change, above the version that last set that emoji's flag.
 */
function withReactionChange(message: HeldSpaceChatMessage, change: ReactionChange, own: boolean): HeldSpaceChatMessage {
  if (message.deleted_at) return message;
  const version = change.version;
  const newer = version === undefined || version > reactionVersion(message);
  let reactions = message.reactions ?? [];
  if (newer && change.reactions) {
    const held = new Map(reactions.map(reaction => [reaction.value, reaction.reacted]));
    reactions = change.reactions
      .filter(reaction => reaction.count > 0)
      .map(reaction => ({ value: reaction.value, count: reaction.count, reacted: held.get(reaction.value) ?? false }));
  } else if (newer && change.count !== undefined) {
    reactions = withReactionCount(reactions, { value: change.value, count: change.count });
  }

  // The viewer's `reacted`: from their own change, and from every emoji their response lists.
  const reactedUpdates = new Map<string, boolean>();
  if (own) {
    for (const reaction of change.reactions ?? []) {
      if (reaction.reacted !== undefined) reactedUpdates.set(reaction.value, reaction.reacted);
    }
    reactedUpdates.set(change.value, change.added);
  }
  let ownVersions = message.own_reacted_versions;
  for (const [value, reacted] of reactedUpdates) {
    if (version !== undefined && version <= ownReactedVersion(message, value)) continue;
    reactions = reactions.map(reaction => (reaction.value === value ? { ...reaction, reacted } : reaction));
    if (version !== undefined) ownVersions = { ...ownVersions, [value]: version };
  }

  if (!newer && ownVersions === message.own_reacted_versions) return message;
  return {
    ...message,
    reactions,
    reaction_version: newer ? (version ?? message.reaction_version) : message.reaction_version,
    own_reacted_versions: ownVersions,
  };
}

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
    case 'reaction': {
      const own = viewerId !== null && dashlessId(viewerId) === dashlessId(event.userId);
      return patchMessage(current, event.messageId, message => withReactionChange(message, event, own));
    }
  }
}

export function redacted(message: SpaceChatMessage, deletedAt: string): SpaceChatMessage {
  return { ...message, body: '', attachment_ids: [], reactions: [], deleted_at: message.deleted_at ?? deletedAt };
}

function withReactionCount(
  reactions: SpaceChatReaction[],
  change: { value: string; count: number; reacted?: boolean }
): SpaceChatReaction[] {
  const index = reactions.findIndex(reaction => reaction.value === change.value);
  if (change.count <= 0) return index === -1 ? reactions : reactions.filter((_, at) => at !== index);
  if (index === -1)
    return [...reactions, { value: change.value, count: change.count, reacted: change.reacted ?? false }];
  return reactions.map((reaction, at) =>
    at === index ? { ...reaction, count: change.count, reacted: change.reacted ?? reaction.reacted } : reaction
  );
}

/** The viewer's own reaction tap, shown until its response settles it. */
export function withPendingReaction(current: SpaceChatState, pending: PendingSpaceChatReaction): SpaceChatState {
  return { ...current, pendingReactions: [...(current.pendingReactions ?? []), pending] };
}

export function withoutPendingReaction(current: SpaceChatState, id: string): SpaceChatState {
  const pendingReactions = current.pendingReactions?.filter(entry => entry.id !== id);
  return pendingReactions?.length === current.pendingReactions?.length ? current : { ...current, pendingReactions };
}

/** The server's answer to the viewer's own reaction: applied like their own event, then the tap settles. */
export function withOwnReactionResult(
  current: SpaceChatState,
  pending: PendingSpaceChatReaction,
  change: ReactionChange
): SpaceChatState {
  const applied = patchMessage(current, pending.messageId, message => withReactionChange(message, change, true));
  return withoutPendingReaction(applied, pending.id);
}

/**
 * A message's reactions as shown: the held counts with the viewer's unsettled taps on top, the
 * latest tap per emoji winning. A tap already matching the held `reacted` changes nothing.
 */
export function shownReactions(
  message: SpaceChatMessage,
  pendingReactions: PendingSpaceChatReaction[] | undefined
): SpaceChatReaction[] {
  const reactions = message.reactions ?? [];
  if (!pendingReactions?.length || message.deleted_at) return reactions;
  const latest = new Map<string, boolean>();
  for (const entry of pendingReactions) {
    if (sameMessageId(entry.messageId, message.id)) latest.set(entry.value, entry.added);
  }
  let shown = reactions;
  for (const [value, added] of latest) {
    const known = shown.find(reaction => reaction.value === value);
    if ((known?.reacted ?? false) === added) continue;
    shown = withReactionCount(shown, { value, count: (known?.count ?? 0) + (added ? 1 : -1), reacted: added });
  }
  return shown;
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
    case 'message.reaction_changed': {
      if (typeof body.message_id !== 'string' || typeof body.user_id !== 'string') return null;
      if (typeof body.value !== 'string' || typeof body.added !== 'boolean') return null;
      const reactions = parseReactionCounts(body.reactions);
      if (!reactions && typeof body.count !== 'number') return null;
      return {
        type: 'reaction',
        messageId: body.message_id,
        userId: body.user_id,
        value: body.value,
        added: body.added,
        ...(typeof body.version === 'number' ? { version: body.version } : {}),
        ...(reactions ? { reactions } : { count: body.count as number }),
      };
    }
    default:
      return null;
  }
}

/** A full reaction list; `null` when absent or unreadable. */
export function parseReactionCounts(value: unknown): ReactionCount[] | null {
  if (!Array.isArray(value)) return null;
  const counts: ReactionCount[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.value !== 'string' || typeof entry.count !== 'number') return null;
    counts.push({
      value: entry.value,
      count: entry.count,
      ...(typeof entry.reacted === 'boolean' ? { reacted: entry.reacted } : {}),
    });
  }
  return counts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
