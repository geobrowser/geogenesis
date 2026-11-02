import { describe, expect, it } from 'vitest';

import type { SpaceChatMessage, SpaceChatPage } from './api';
import {
  type SpaceChatState,
  parseSpaceChatRoomEvent,
  withChatMessage,
  withChatPage,
  withOlderChatPage,
  withOwnReaction,
  withPendingMessage,
  withRoomEvent,
} from './state';

const VIEWER = '0191aaaa000070008000000000000001';
const OTHER = '0191bbbb000070008000000000000002';

function message(n: number, overrides: Partial<SpaceChatMessage> = {}): SpaceChatMessage {
  return {
    id: `0195000000007000800000000000${String(n).padStart(4, '0')}`,
    room_id: 'room',
    room_kind: 'member',
    author_id: OTHER,
    client_nonce: `c-${n}`,
    reply_to_message_id: null,
    body: `message ${n}`,
    attachment_ids: [],
    created_at: `2026-11-02T12:00:${String(n).padStart(2, '0')}.000Z`,
    edited_at: null,
    deleted_at: null,
    reactions: [],
    ...overrides,
  };
}

function page(ns: number[], nextBefore: number | null = null): SpaceChatPage {
  return {
    messages: ns.map(n => message(n)).reverse(),
    next_before: nextBefore === null ? null : { before_message_id: message(nextBefore).id },
  };
}

const ids = (state: SpaceChatState) => state.messages.map(item => Number(item.id.slice(-4)));

describe('space chat state', () => {
  it('keeps older pages when the newest page is read again', () => {
    let state = withChatPage(undefined, page([3, 4, 5], 3));
    state = withOlderChatPage(state, page([1, 2]));
    state = withChatPage(state, page([4, 5, 6], 4));
    expect(ids(state)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(state.nextBefore).toBeNull();
  });

  it('starts over when the newest page no longer joins what is cached', () => {
    let state = withChatPage(undefined, page([1, 2], null));
    state = withChatPage(state, page([10, 11], 10));
    expect(ids(state)).toEqual([11, 10]);
    expect(state.nextBefore).toBe(message(10).id);
  });

  it('merges an after-cursor poll, keeping older pages and their cursor', () => {
    let state = withChatPage(undefined, page([3, 4, 5], 3));
    expect(withChatPage(state, page([])).messages).toEqual(state.messages);
    expect(withChatPage(state, page([])).nextBefore).toBe(message(3).id);
    state = withChatPage(state, page([6, 7]));
    expect(ids(state)).toEqual([7, 6, 5, 4, 3]);
    expect(state.nextBefore).toBe(message(3).id);
  });

  it('replaces a pending send with the stored message by nonce', () => {
    let state = withChatPage(undefined, page([1]));
    state = withPendingMessage(state, {
      client_nonce: 'c-2',
      body: 'message 2',
      reply_to_message_id: null,
      created_at: 'x',
    });
    expect(state.pending).toHaveLength(1);
    state = withChatMessage(state, message(2));
    expect(state.pending).toHaveLength(0);
    expect(ids(state)).toEqual([2, 1]);
  });

  it('keeps known reactions when message.created repeats a message', () => {
    let state = withChatPage(undefined, {
      messages: [message(1, { reactions: [{ value: '👍', count: 2, reacted: true }] })],
      next_before: null,
    });
    state = withChatMessage(state, message(1));
    expect(state.messages[0]!.reactions).toEqual([{ value: '👍', count: 2, reacted: true }]);
  });

  it('applies edits, ignoring an older one', () => {
    let state = withChatPage(undefined, page([1]));
    state = withRoomEvent(
      state,
      { type: 'edited', messageId: message(1).id, body: 'new', editedAt: '2026-11-02T12:05:00Z' },
      null
    );
    state = withRoomEvent(
      state,
      { type: 'edited', messageId: message(1).id, body: 'old', editedAt: '2026-11-02T12:04:00Z' },
      null
    );
    expect(state.messages[0]!.body).toBe('new');
  });

  it('redacts a deleted message, and a delete beats a later page copy', () => {
    let state = withChatPage(undefined, {
      messages: [message(1, { reactions: [{ value: '👍', count: 1, reacted: false }] })],
      next_before: null,
    });
    state = withRoomEvent(
      state,
      { type: 'deleted', messageId: message(1).id, deletedAt: '2026-11-02T12:06:00Z' },
      null
    );
    expect(state.messages[0]).toMatchObject({ body: '', reactions: [], deleted_at: '2026-11-02T12:06:00Z' });
    state = withChatPage(state, page([1]));
    expect(state.messages[0]!.deleted_at).not.toBeNull();
  });

  it('sets reaction counts from events, marking only the viewer’s own', () => {
    let state = withChatPage(undefined, page([1]));
    const id = message(1).id;
    state = withRoomEvent(
      state,
      { type: 'reaction', messageId: id, userId: OTHER, value: '👍', count: 1, added: true },
      VIEWER
    );
    expect(state.messages[0]!.reactions).toEqual([{ value: '👍', count: 1, reacted: false }]);
    state = withRoomEvent(
      state,
      { type: 'reaction', messageId: id, userId: VIEWER.toUpperCase(), value: '👍', count: 2, added: true },
      VIEWER
    );
    expect(state.messages[0]!.reactions).toEqual([{ value: '👍', count: 2, reacted: true }]);
    state = withRoomEvent(
      state,
      { type: 'reaction', messageId: id, userId: OTHER, value: '👍', count: 1, added: false },
      VIEWER
    );
    expect(state.messages[0]!.reactions).toEqual([{ value: '👍', count: 1, reacted: true }]);
    state = withRoomEvent(
      state,
      { type: 'reaction', messageId: id, userId: VIEWER, value: '👍', count: 0, added: false },
      VIEWER
    );
    expect(state.messages[0]!.reactions).toEqual([]);
  });

  it('guesses the viewer’s own reaction, and does nothing when already set', () => {
    let state = withChatPage(undefined, page([1]));
    const id = message(1).id;
    state = withOwnReaction(state, id, '🎉', true);
    expect(state.messages[0]!.reactions).toEqual([{ value: '🎉', count: 1, reacted: true }]);
    const again = withOwnReaction(state, id, '🎉', true);
    expect(again).toBe(state);
    state = withOwnReaction(state, id, '🎉', false);
    expect(state.messages[0]!.reactions).toEqual([]);
  });

  it('parses the gateway room events and ignores unknown ones', () => {
    expect(parseSpaceChatRoomEvent({ event_type: 'message.created', payload: { message: message(1) } })).toEqual({
      type: 'created',
      message: message(1),
    });
    expect(
      parseSpaceChatRoomEvent({
        event_type: 'message.reaction_changed',
        payload: {
          message_id: 'm',
          room_id: 'r',
          room_kind: 'member',
          user_id: 'u',
          value: '👍',
          count: 3,
          added: true,
        },
      })
    ).toEqual({ type: 'reaction', messageId: 'm', userId: 'u', value: '👍', count: 3, added: true });
    expect(parseSpaceChatRoomEvent({ event_type: 'message.pinned', payload: {} })).toBeNull();
    expect(parseSpaceChatRoomEvent({ event_type: 'message.deleted', payload: { message_id: 'm' } })).toBeNull();
  });
});
