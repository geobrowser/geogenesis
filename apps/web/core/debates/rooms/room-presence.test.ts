import { describe, expect, it } from 'vitest';

import type { DebateRoom, DebateRoomParticipant } from '../api';
import { debateRoomPresence } from './room-presence';

const VIEWER = 'user-viewer';
const OPPONENT = 'user-opponent';

const OPENS_AT = '2026-09-21T09:00:00.000Z';
const BEFORE_OPEN = Date.parse('2026-09-21T08:45:00.000Z');
const AFTER_OPEN = Date.parse('2026-09-21T09:05:00.000Z');

function participant(userId: string, overrides: Partial<DebateRoomParticipant> = {}): DebateRoomParticipant {
  return {
    user_id: userId,
    profile_space_id: `${userId}-space`,
    display_name: userId,
    avatar_cid: null,
    joined_at: null,
    left_at: null,
    present: false,
    ...overrides,
  };
}

function room(overrides: Partial<DebateRoom> = {}): DebateRoom {
  return {
    id: 'room-1',
    rematch_session_id: 'session-1',
    source_space_id: 'space-1',
    participants: [participant(VIEWER, { joined_at: OPENS_AT, present: true }), participant(OPPONENT)],
    opens_at: OPENS_AT,
    closes_at: '2026-09-21T10:00:00.000Z',
    no_show_at: null,
    waiting_reason: null,
    created_at: OPENS_AT,
    updated_at: OPENS_AT,
    ...overrides,
  };
}

function stateAt(now: number, overrides: Partial<DebateRoom> = {}, currentUserId: string | null = VIEWER) {
  return debateRoomPresence({ room: room(overrides), currentUserId, now })?.state ?? null;
}

describe('debateRoomPresence', () => {
  it('says nothing without a room', () => {
    expect(debateRoomPresence({ room: null, currentUserId: VIEWER, now: AFTER_OPEN })).toBeNull();
  });

  // Guessing at `waiting` would claim someone is late who was never expected.
  it('says nothing before the viewer is identified', () => {
    expect(stateAt(AFTER_OPEN, {}, null)).toBeNull();
  });

  it('says nothing to someone outside the access list', () => {
    expect(stateAt(AFTER_OPEN, {}, 'user-stranger')).toBeNull();
  });

  it('is state 1 when the viewer arrives before the window opens', () => {
    expect(stateAt(BEFORE_OPEN)).toBe('arrived_early');
  });

  it('is state 2 once the window is open and they have not come', () => {
    expect(stateAt(AFTER_OPEN)).toBe('waiting');
  });

  it('is state 2b when the server says they are mid-debate elsewhere', () => {
    expect(stateAt(AFTER_OPEN, { waiting_reason: 'in_another_debate' })).toBe('waiting_elsewhere');
  });

  it('is state 3 on an explicit join', () => {
    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: OPENS_AT, present: true }),
    ];
    expect(stateAt(AFTER_OPEN, { participants })).toBe('present');
  });

  it('is state 4 on an explicit leave', () => {
    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: OPENS_AT, left_at: '2026-09-21T09:02:00.000Z' }),
    ];
    expect(stateAt(AFTER_OPEN, { participants })).toBe('left');
  });

  it('is state 5 past the server-defined deadline with no join event', () => {
    expect(stateAt(AFTER_OPEN, { no_show_at: '2026-09-21T09:04:00.000Z' })).toBe('no_show');
  });

  // A room the pair are both sitting in is not a room anyone is early for.
  it('prefers state 3 over state 1 when they are already here', () => {
    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: OPENS_AT, present: true }),
    ];
    expect(stateAt(BEFORE_OPEN, { participants })).toBe('present');
  });

  // An early leave reported as state 1 would read as nobody having arrived at all.
  it('prefers state 4 over state 1 when they came early and left', () => {
    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: '2026-09-21T08:40:00.000Z', left_at: '2026-09-21T08:42:00.000Z' }),
    ];
    expect(stateAt(BEFORE_OPEN, { participants })).toBe('left');
  });

  // GEO-2946 converts a wait into a no-show on a deadline whatever the reason for it.
  it('resolves state 2b into state 5 once the deadline passes', () => {
    const state = stateAt(AFTER_OPEN, {
      waiting_reason: 'in_another_debate',
      no_show_at: '2026-09-21T09:04:00.000Z',
    });
    expect(state).toBe('no_show');
  });

  // The window governs joining, never leaving, so no state may turn on the clock running out.
  it('does not change state when the window closes with both of them inside', () => {
    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: OPENS_AT, present: true }),
    ];
    const pastClose = Date.parse('2026-09-21T11:30:00.000Z');
    expect(stateAt(pastClose, { participants })).toBe('present');
  });

  it('opens the mic only in state 3', () => {
    const waiting = debateRoomPresence({ room: room(), currentUserId: VIEWER, now: AFTER_OPEN });
    expect(waiting?.opponentPresent).toBe(false);

    const participants = [
      participant(VIEWER, { present: true }),
      participant(OPPONENT, { joined_at: OPENS_AT, present: true }),
    ];
    const together = debateRoomPresence({ room: room({ participants }), currentUserId: VIEWER, now: AFTER_OPEN });
    expect(together?.opponentPresent).toBe(true);
  });

  // An unreadable timestamp must not declare a no-show off a comparison against NaN.
  it('falls back to waiting on an unparseable timestamp', () => {
    expect(stateAt(AFTER_OPEN, { opens_at: 'not-a-date', no_show_at: 'not-a-date' })).toBe('waiting');
  });
});
