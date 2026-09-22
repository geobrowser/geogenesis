import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import type { DebateRoomView } from '../api';
import { useDebateRoomPresence } from './hooks';

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPPONENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// The room view sends dashed uuids; the session token's `user_id` is dashless. The hook has to
// compare them, so the fixtures use the two real spellings rather than one synthetic id.
const VIEWER_DASHLESS = VIEWER.replace(/-/g, '');

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => VIEWER_DASHLESS,
}));

function room(occupants: string[], waiting: DebateRoomView['waiting'] = { reason: 'opponent_late' }): DebateRoomView {
  return {
    room_id: 'room-1',
    access: { status: 'admitted' },
    starts_at: '2026-09-22T09:00:00.000Z',
    opens_at: '2026-09-22T08:50:00.000Z',
    scheduled_end_at: null,
    participants: [VIEWER, OPPONENT],
    occupants,
    waiting,
    rematch_session_id: 'session-1',
  };
}

describe('useDebateRoomPresence', () => {
  it('reads the opponent across the dashed and dashless spellings', () => {
    const { result } = renderHook(() => useDebateRoomPresence(room([VIEWER, OPPONENT], null)));

    expect(result.current?.state).toBe('present');
    expect(result.current?.opponentUserId).toBe(OPPONENT);
  });

  // Whoever arrives second sees the room already occupied, so `opponentPresent` and the room id
  // change in the same commit.
  it('says they left when the opponent was already there on arrival', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER, OPPONENT], null) },
    });
    expect(result.current?.state).toBe('present');

    rerender({ view: room([VIEWER]) });
    expect(result.current?.state).toBe('left');
  });

  it('says they left when the opponent arrives and then goes', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER]) },
    });
    expect(result.current?.state).toBe('waiting');

    rerender({ view: room([VIEWER, OPPONENT], null) });
    expect(result.current?.state).toBe('present');

    rerender({ view: room([VIEWER]) });
    expect(result.current?.state).toBe('left');
  });

  // Someone who never came is not someone who left.
  it('keeps waiting when the opponent has never been seen', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER]) },
    });
    rerender({ view: room([VIEWER]) });

    expect(result.current?.state).toBe('waiting');
  });

  // One room's memory must not describe another.
  it('forgets the opponent when the room changes', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER, OPPONENT], null) },
    });
    expect(result.current?.state).toBe('present');

    rerender({ view: { ...room([VIEWER]), room_id: 'room-2' } });
    expect(result.current?.state).toBe('waiting');
  });
});
