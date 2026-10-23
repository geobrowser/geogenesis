import { describe, expect, it } from 'vitest';

import type { DebateRoomView } from '../api';
import {
  minutesSince,
  nudgeButtonState,
  opponentPresence,
  roomWaitingTimeline,
  showsWaitingStatus,
} from './room-waiting';

// GEO-3428: what the debater waiting in a scheduled room is told about the other one.

const room: DebateRoomView = {
  room_id: 'room-1',
  access: { status: 'admitted' },
  starts_at: '2026-10-21T17:00:00.000Z',
  opens_at: '2026-10-21T16:50:00.000Z',
  scheduled_end_at: null,
  participants: ['maya', 'jordan'],
  occupants: ['maya'],
  waiting: { reason: 'opponent_late' },
  rematch_session_id: 'session-1',
  reminders: [
    { user_id: 'jordan', kind: 'opponent_waiting', at: '2026-10-21T17:01:00.000Z' },
    { user_id: 'jordan', kind: 'room_open', at: '2026-10-21T16:50:00.000Z' },
  ],
  nudges: [
    { from_user_id: 'maya', to_user_id: 'jordan', channel: 'email', at: '2026-10-21T17:04:00.000Z' },
    // Jordan nudging Maya some other time is not Maya's timeline.
    { from_user_id: 'jordan', to_user_id: 'maya', channel: 'popup', at: '2026-10-21T17:02:00.000Z' },
  ],
  notices: [],
  presence: [{ user_id: 'jordan', online: false, last_online_at: '2026-10-21T16:52:00.000Z' }],
  viewer_next_nudge_at: '2026-10-21T17:19:00.000Z',
};

const at = (iso: string) => new Date(iso).getTime();

describe('roomWaitingTimeline', () => {
  it('lists the other’s reminders and the viewer’s nudges to them, oldest first', () => {
    expect(roomWaitingTimeline(room, 'jordan', 'maya')).toEqual([
      { kind: 'room_open', at: '2026-10-21T16:50:00.000Z' },
      { kind: 'opponent_waiting', at: '2026-10-21T17:01:00.000Z' },
      { kind: 'nudged', at: '2026-10-21T17:04:00.000Z', channel: 'email' },
    ]);
  });

  it('adds when they said they are running late, in its place', () => {
    const late = {
      ...room,
      notices: [
        {
          user_id: 'jordan',
          kind: 'running_late' as const,
          at: '2026-10-21T17:03:00.000Z',
          expected_at: '2026-10-21T17:13:00.000Z',
          note: null,
        },
      ],
    };
    expect(roomWaitingTimeline(late, 'jordan', 'maya').map(entry => entry.kind)).toEqual([
      'room_open',
      'opponent_waiting',
      'running_late',
      'nudged',
    ]);
  });

  it('matches ids spelled with or without dashes, and is empty from an older geo-chat', () => {
    const dashed = { ...room, reminders: [{ user_id: 'aaaa-bbbb', kind: 'room_open' as const, at: room.opens_at }] };
    expect(roomWaitingTimeline(dashed, 'aaaabbbb', 'maya')).toHaveLength(1);
    const { reminders: _r, nudges: _n, ...older } = room;
    expect(roomWaitingTimeline(older, 'jordan', 'maya')).toEqual([]);
  });
});

describe('opponentPresence and minutesSince', () => {
  it('reads the other debater’s presence, and how long since they were on', () => {
    expect(opponentPresence(room, 'jordan')?.online).toBe(false);
    expect(opponentPresence({ ...room, presence: undefined }, 'jordan')).toBeNull();
    expect(minutesSince('2026-10-21T16:52:00.000Z', at('2026-10-21T17:04:30.000Z'))).toBe(12);
    // A clock behind the server's reads as just now, never as the future.
    expect(minutesSince('2026-10-21T17:05:00.000Z', at('2026-10-21T17:04:00.000Z'))).toBe(0);
    expect(minutesSince('not a time', 0)).toBeNull();
  });
});

describe('showsWaitingStatus', () => {
  it('is for the viewer alone in the room past the start', () => {
    expect(showsWaitingStatus('waiting')).toBe(true);
    expect(showsWaitingStatus('waiting_elsewhere')).toBe(true);
    expect(showsWaitingStatus('left')).toBe(true);
    expect(showsWaitingStatus('no_show')).toBe(true);
    expect(showsWaitingStatus('arrived_early')).toBe(false);
    expect(showsWaitingStatus('present')).toBe(false);
    expect(showsWaitingStatus(null)).toBe(false);
  });
});

describe('nudgeButtonState', () => {
  it('waits out the 15 minutes as Nudged, then is ready again', () => {
    expect(nudgeButtonState(room, 'maya', at('2026-10-21T17:10:00.000Z'))).toBe('nudged');
    expect(nudgeButtonState(room, 'maya', at('2026-10-21T17:19:00.000Z'))).toBe('ready');
  });

  it('stays Nudged for good once both are used', () => {
    expect(nudgeButtonState({ ...room, viewer_next_nudge_at: null }, 'maya', Date.now())).toBe('nudged');
  });

  // Before the first nudge the next time is the start, which the room poll can reach first.
  it('is not Nudged before the viewer has sent one, only not yet pressable', () => {
    const fresh = { ...room, nudges: [], viewer_next_nudge_at: '2026-10-21T17:00:00.000Z' };
    expect(nudgeButtonState(fresh, 'maya', at('2026-10-21T16:59:55.000Z'))).toBe('not_yet');
    expect(nudgeButtonState(fresh, 'maya', at('2026-10-21T17:00:00.000Z'))).toBe('ready');
  });

  // Between a nudge and the room's refetch, the endpoint's answer holds the button.
  it('takes the nudge endpoint’s next time as a floor until the room catches up', () => {
    const before = { ...room, nudges: [], viewer_next_nudge_at: '2026-10-21T17:00:00.000Z' };
    const now = at('2026-10-21T17:04:00.000Z');
    expect(nudgeButtonState(before, 'maya', now)).toBe('ready');
    expect(nudgeButtonState(before, 'maya', now, { next_nudge_at: '2026-10-21T17:19:00.000Z' })).toBe('nudged');
    expect(nudgeButtonState(before, 'maya', now, { next_nudge_at: null })).toBe('nudged');
  });

  it('is hidden from a geo-chat that predates nudges', () => {
    const { viewer_next_nudge_at: _next, ...older } = room;
    expect(nudgeButtonState(older, 'maya', Date.now())).toBe('hidden');
  });
});
