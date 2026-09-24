import { describe, expect, it } from 'vitest';

import type { DebateRoomAccess, DebateRoomView, DebateRoomWaiting } from '../api';
import { debateRoomPresence } from './room-presence';

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPPONENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function room(overrides: Partial<DebateRoomView> = {}): DebateRoomView {
  return {
    room_id: 'room-1',
    access: { status: 'admitted' } satisfies DebateRoomAccess,
    starts_at: '2026-09-21T09:00:00.000Z',
    opens_at: '2026-09-21T08:50:00.000Z',
    scheduled_end_at: '2026-09-21T09:30:00.000Z',
    participants: [VIEWER, OPPONENT],
    occupants: [VIEWER],
    waiting: { reason: 'opponent_late' } satisfies DebateRoomWaiting,
    rematch_session_id: 'session-1',
    ...overrides,
  };
}

// The room view sends dashed ids; the session token's `user_id` is dashless. Both spellings, so a
// comparison that trusted either one fails here.
const VIEWER_AS_TOKEN_SPELLS_IT = VIEWER.replace(/-/g, '');

function stateOf(
  overrides: Partial<DebateRoomView> = {},
  sawOpponent = false,
  currentUserId: string | null = VIEWER_AS_TOKEN_SPELLS_IT
) {
  return debateRoomPresence({ room: room(overrides), currentUserId, sawOpponent })?.state ?? null;
}

describe('debateRoomPresence', () => {
  it('says nothing without a room', () => {
    expect(debateRoomPresence({ room: null, currentUserId: VIEWER_AS_TOKEN_SPELLS_IT, sawOpponent: false })).toBeNull();
  });

  // Guessing at `waiting` would claim someone is late who was never expected.
  it('says nothing before the viewer is identified', () => {
    expect(stateOf({}, false, null)).toBeNull();
  });

  // A stranger is refused in the body with empty lists, not by an HTTP status.
  it.each([
    ['a stranger', { status: 'not_a_participant' } as DebateRoomAccess],
    ['a closed room', { status: 'closed', reason: 'completed' } as DebateRoomAccess],
    ['a locked door', { status: 'not_yet_open', opens_at: '2026-09-21T08:50:00.000Z' } as DebateRoomAccess],
  ])('says nothing to %s', (_label, access) => {
    expect(stateOf({ access })).toBeNull();
  });

  it('is state 1 before the scheduled start', () => {
    expect(stateOf({ waiting: { reason: 'not_yet_due' } })).toBe('arrived_early');
  });

  it('is state 2 once the start has passed', () => {
    expect(stateOf({ waiting: { reason: 'opponent_late' } })).toBe('waiting');
  });

  it('is state 2b when the server says they are mid-debate elsewhere', () => {
    expect(stateOf({ waiting: { reason: 'opponent_in_another_debate' } })).toBe('waiting_elsewhere');
  });

  it('is state 3 when they are in the occupant list', () => {
    expect(stateOf({ occupants: [VIEWER, OPPONENT], waiting: null })).toBe('present');
  });

  it('is state 5 once the grace period has elapsed', () => {
    expect(stateOf({ waiting: { reason: 'no_show' } })).toBe('no_show');
  });

  // The view reports who is in the room, never who has been, so this visit's memory is the only
  // thing separating "they left" from "they never came".
  it('is state 4 when someone seen earlier is no longer an occupant', () => {
    expect(stateOf({ waiting: { reason: 'opponent_late' } }, true)).toBe('left');
  });

  it('prefers left over arrived early for someone who came and went', () => {
    expect(stateOf({ waiting: { reason: 'not_yet_due' } }, true)).toBe('left');
  });

  // Being here outranks the memory of having been here.
  it('prefers present over left when they come back', () => {
    expect(stateOf({ occupants: [VIEWER, OPPONENT], waiting: null }, true)).toBe('present');
  });

  // geo-chat's `no_show` is a clock, not a verdict: it fires once the viewer has waited long enough
  // alone, including after an opponent who came and went.
  it('says they left, not that they never came, once the wait runs out', () => {
    expect(stateOf({ waiting: { reason: 'no_show' } }, true)).toBe('left');
  });

  it('says they never came when they were never seen', () => {
    expect(stateOf({ waiting: { reason: 'no_show' } }, false)).toBe('no_show');
  });

  // `waiting` is null until the viewer joins, so there is no one-sided wait to describe.
  it('falls back to waiting with no reason reported', () => {
    expect(stateOf({ waiting: null })).toBe('waiting');
  });

  it('opens the mic only when they are present', () => {
    const alone = debateRoomPresence({ room: room(), currentUserId: VIEWER_AS_TOKEN_SPELLS_IT, sawOpponent: false });
    expect(alone?.opponentPresent).toBe(false);

    const together = debateRoomPresence({
      room: room({ occupants: [VIEWER, OPPONENT], waiting: null }),
      currentUserId: VIEWER_AS_TOKEN_SPELLS_IT,
      sawOpponent: false,
    });
    expect(together?.opponentPresent).toBe(true);
    expect(together?.opponentUserId).toBe(OPPONENT);
  });
});
