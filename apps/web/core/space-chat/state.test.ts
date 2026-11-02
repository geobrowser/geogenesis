import { describe, expect, it } from 'vitest';

import type { SpaceChatMessage, SpaceChatPage } from './api';
import {
  type SpaceChatState,
  parseSpaceChatRoomEvent,
  shownReactions,
  withChatMessage,
  withChatPage,
  withOlderChatPage,
  withOwnReactionResult,
  withPendingMessage,
  withPendingReaction,
  withRoomEvent,
  withoutPendingReaction,
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

  describe('reaction versions', () => {
    const id = message(1).id;
    type Counts = { value: string; count: number; reacted?: boolean }[];
    const event = (version: number, value: string, reactions: Counts, userId = OTHER, added = true) =>
      ({ type: 'reaction', messageId: id, userId, value, added, version, reactions }) as const;
    const seeded = (reactions = [{ value: '👍', count: 1, reacted: false }], version = 1) =>
      withChatPage(undefined, { messages: [message(1, { reactions, reaction_version: version })], next_before: null });
    const reactionsOf = (state: SpaceChatState) => state.messages[0]!.reactions;
    const tap = (value: string, added: boolean, tapId = `tap-${value}`) => ({ id: tapId, messageId: id, value, added });

    it('keeps an emoji that a newer full list carries when its own older event is dropped', () => {
      let state = seeded([], 3);
      state = withRoomEvent(
        state,
        event(5, '❤️', [
          { value: '👍', count: 1 },
          { value: '❤️', count: 1 },
        ]),
        VIEWER
      );
      state = withRoomEvent(state, event(4, '👍', [{ value: '👍', count: 1 }]), VIEWER);
      expect(reactionsOf(state)).toEqual([
        { value: '👍', count: 1, reacted: false },
        { value: '❤️', count: 1, reacted: false },
      ]);
      expect(state.messages[0]!.reaction_version).toBe(5);
    });

    it('replaces the counts with the full list and keeps the viewer’s reacted per emoji', () => {
      let state = seeded([{ value: '👍', count: 2, reacted: true }]);
      state = withRoomEvent(
        state,
        event(2, '🎉', [
          { value: '👍', count: 2 },
          { value: '🎉', count: 1 },
        ]),
        VIEWER
      );
      expect(reactionsOf(state)).toEqual([
        { value: '👍', count: 2, reacted: true },
        { value: '🎉', count: 1, reacted: false },
      ]);
      state = withRoomEvent(state, event(3, '👍', [{ value: '🎉', count: 1 }], VIEWER, false), VIEWER);
      expect(reactionsOf(state)).toEqual([{ value: '🎉', count: 1, reacted: false }]);
      state = withRoomEvent(state, event(4, '🎉', []), VIEWER);
      expect(reactionsOf(state)).toEqual([]);
    });

    it('drops an event older than the history read it follows', () => {
      const state = withRoomEvent(seeded(), event(1, '👍', []), VIEWER);
      expect(reactionsOf(state)).toEqual([{ value: '👍', count: 1, reacted: false }]);
    });

    it('settles the viewer’s own reaction whether its response or its event comes first', () => {
      const pending = tap('👍', true);
      const tapped = withPendingReaction(seeded(), pending);
      const response = { value: '👍', added: true, version: 2, reactions: [{ value: '👍', count: 2, reacted: true }] };
      const viewersEvent = event(2, '👍', [{ value: '👍', count: 2 }], VIEWER);
      const viaResponse = withRoomEvent(withOwnReactionResult(tapped, pending, response), viewersEvent, VIEWER);
      const viaEvent = withOwnReactionResult(withRoomEvent(tapped, viewersEvent, VIEWER), pending, response);
      for (const state of [viaResponse, viaEvent]) {
        expect(reactionsOf(state)).toEqual([{ value: '👍', count: 2, reacted: true }]);
        expect(state.pendingReactions).toEqual([]);
      }
    });

    it('shows the viewer’s tap through someone else’s event, then settles it from the response', () => {
      const pending = tap('👍', true);
      let state = withPendingReaction(seeded([], 1), pending);
      expect(shownReactions(state.messages[0]!, state.pendingReactions)).toEqual([
        { value: '👍', count: 1, reacted: true },
      ]);
      // Someone else's ❤️ committed first, without the viewer's 👍.
      state = withRoomEvent(state, event(2, '❤️', [{ value: '❤️', count: 1 }]), VIEWER);
      expect(shownReactions(state.messages[0]!, state.pendingReactions)).toEqual([
        { value: '❤️', count: 1, reacted: false },
        { value: '👍', count: 1, reacted: true },
      ]);
      state = withOwnReactionResult(state, pending, {
        value: '👍',
        added: true,
        version: 3,
        reactions: [
          { value: '❤️', count: 1, reacted: false },
          { value: '👍', count: 1, reacted: true },
        ],
      });
      expect(state.pendingReactions).toEqual([]);
      expect(shownReactions(state.messages[0]!, state.pendingReactions)).toEqual([
        { value: '❤️', count: 1, reacted: false },
        { value: '👍', count: 1, reacted: true },
      ]);
    });

    it('keeps the viewer’s reacted from their response when someone else’s later list landed first', () => {
      const pending = tap('👍', true);
      let state = withPendingReaction(seeded(), pending);
      state = withRoomEvent(
        state,
        event(3, '🎉', [
          { value: '👍', count: 2 },
          { value: '🎉', count: 1 },
        ]),
        VIEWER
      );
      state = withOwnReactionResult(state, pending, {
        value: '👍',
        added: true,
        version: 2,
        reactions: [{ value: '👍', count: 2, reacted: true }],
      });
      expect(reactionsOf(state)).toEqual([
        { value: '👍', count: 2, reacted: true },
        { value: '🎉', count: 1, reacted: false },
      ]);
      expect(state.messages[0]!.reaction_version).toBe(3);
    });

    it('ignores the viewer’s stale response after their own later change', () => {
      const add = tap('👍', true, 'add');
      const remove = tap('👍', false, 'remove');
      let state = withPendingReaction(withPendingReaction(seeded(), add), remove);
      state = withOwnReactionResult(state, remove, {
        value: '👍',
        added: false,
        version: 3,
        reactions: [{ value: '👍', count: 1, reacted: false }],
      });
      state = withOwnReactionResult(state, add, {
        value: '👍',
        added: true,
        version: 2,
        reactions: [{ value: '👍', count: 2, reacted: true }],
      });
      expect(reactionsOf(state)).toEqual([{ value: '👍', count: 1, reacted: false }]);
      expect(state.pendingReactions).toEqual([]);
    });

    it('shows the latest unsettled tap per emoji, and nothing for a tap the held state already matches', () => {
      let state = withPendingReaction(seeded([{ value: '👍', count: 1, reacted: true }]), tap('👍', true));
      expect(shownReactions(state.messages[0]!, state.pendingReactions)).toEqual([
        { value: '👍', count: 1, reacted: true },
      ]);
      state = withPendingReaction(state, tap('👍', false, 'second'));
      expect(shownReactions(state.messages[0]!, state.pendingReactions)).toEqual([]);
      state = withoutPendingReaction(state, 'second');
      expect(state.pendingReactions).toHaveLength(1);
    });

    it('keeps the viewer’s unsettled taps through every page merge', () => {
      const pending = tap('👍', true);
      const tapped = withPendingReaction(seeded(), pending);
      const merged = withChatPage(tapped, {
        messages: [message(1, { reactions: [{ value: '👍', count: 1, reacted: false }], reaction_version: 1 })],
        next_before: null,
      });
      const restarted = withChatPage(tapped, {
        messages: [message(80), message(79)],
        next_before: { before_message_id: message(79).id },
      });
      const older = withOlderChatPage(tapped, { messages: [message(0)], next_before: null });
      const created = withChatMessage(tapped, message(2));
      for (const state of [merged, restarted, older, created]) expect(state.pendingReactions).toEqual([pending]);
      expect(shownReactions(merged.messages[0]!, merged.pendingReactions)).toEqual([
        { value: '👍', count: 2, reacted: true },
      ]);
    });

    it('keeps the higher-version reactions when a page copy is older', () => {
      let state = withRoomEvent(seeded(), event(4, '👍', [{ value: '👍', count: 4 }]), VIEWER);
      state = withChatPage(state, {
        messages: [message(1, { reactions: [{ value: '👍', count: 1, reacted: false }], reaction_version: 1 })],
        next_before: null,
      });
      expect(state.messages[0]).toMatchObject({ reactions: [{ value: '👍', count: 4 }], reaction_version: 4 });
    });

    it('applies every change from a geo-chat without versions or lists', () => {
      let state = withChatPage(undefined, page([1]));
      state = withRoomEvent(
        state,
        { type: 'reaction', messageId: id, userId: OTHER, value: '👍', count: 2, added: true },
        VIEWER
      );
      state = withRoomEvent(
        state,
        { type: 'reaction', messageId: id, userId: OTHER, value: '👍', count: 1, added: false },
        VIEWER
      );
      expect(reactionsOf(state)).toEqual([{ value: '👍', count: 1, reacted: false }]);
    });
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
          version: 7,
        },
      })
    ).toEqual({ type: 'reaction', messageId: 'm', userId: 'u', value: '👍', count: 3, added: true, version: 7 });
    expect(
      parseSpaceChatRoomEvent({
        event_type: 'message.reaction_changed',
        payload: { message_id: 'm', user_id: 'u', value: '👍', added: false, version: 8, reactions: [] },
      })
    ).toEqual({ type: 'reaction', messageId: 'm', userId: 'u', value: '👍', added: false, version: 8, reactions: [] });
    expect(
      parseSpaceChatRoomEvent({
        event_type: 'message.reaction_changed',
        payload: { message_id: 'm', user_id: 'u', value: '👍', added: true, reactions: [{ value: 1 }] },
      })
    ).toBeNull();
    expect(parseSpaceChatRoomEvent({ event_type: 'message.pinned', payload: {} })).toBeNull();
    expect(parseSpaceChatRoomEvent({ event_type: 'message.deleted', payload: { message_id: 'm' } })).toBeNull();
  });
});
