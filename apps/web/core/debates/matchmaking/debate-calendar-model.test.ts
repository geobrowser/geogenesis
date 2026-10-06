import { describe, expect, it } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';
import type { SchedulablePeopleResponse, ScheduledDebateRequest } from '~/core/debates/api';

import {
  SLOT_MS,
  cellOf,
  firstBusyHour,
  freeSlotsByUser,
  hourProgress,
  ownDebates,
  viewerFreeCellKeys,
  viewerFreeSlots,
  weekCells,
  weekDays,
  weekRangeLabel,
  weekStart,
} from './debate-calendar-model';

// Wednesday 7 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 7, 10, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function person(userId: string, overrides: Partial<SchedulablePeopleResponse['people'][number]> = {}) {
  return {
    user: { user_id: userId, profile_space_id: `space-${userId}`, display_name: userId, avatar_cid: null },
    online: false,
    slots: [],
    truncated: false,
    ...overrides,
  };
}

function response(people: SchedulablePeopleResponse['people']): SchedulablePeopleResponse {
  return { viewer_timezone: 'UTC', viewer_has_schedule: false, people, truncated: false };
}

describe('freeSlotsByUser', () => {
  it('expands each free window into its bookable half-hours, keeping the viewer flag', () => {
    const byUser = freeSlotsByUser(
      response([
        person('a', {
          their_windows: [
            { start: iso(at(8, 18)), end: iso(at(8, 19)), viewer_free: true },
            { start: iso(at(8, 19)), end: iso(at(8, 19, 30)), viewer_free: false },
          ],
        }),
      ]),
      NOW.getTime()
    );

    expect(byUser.get('a')).toEqual([
      { start: at(8, 18), viewerFree: true },
      { start: at(8, 18, 30), viewerFree: true },
      { start: at(8, 19), viewerFree: false },
    ]);
  });

  it('drops half-hours that have already started', () => {
    const byUser = freeSlotsByUser(
      response([person('a', { their_windows: [{ start: iso(at(7, 9)), end: iso(at(7, 11)), viewer_free: false }] })]),
      NOW.getTime()
    );

    expect(byUser.get('a')?.map(slot => slot.start)).toEqual([at(7, 10, 30)]);
  });

  it('reads only their whole free time, never the shared slots on their own', () => {
    const byUser = freeSlotsByUser(
      response([person('a', { slots: [{ start: iso(at(9, 15)), end: iso(at(9, 15, 30)) }] })]),
      NOW.getTime()
    );
    expect(byUser.has('a')).toBe(false);
  });

  it('leaves out people with nothing left to book', () => {
    const byUser = freeSlotsByUser(response([person('a', { their_windows: [] })]), NOW.getTime());
    expect(byUser.has('a')).toBe(false);
  });
});

describe('week', () => {
  it('starts on the local Sunday and offers this week and next', () => {
    expect(weekStart(NOW, 0)).toEqual(new Date(2026, 9, 4));
    expect(weekStart(NOW, 1)).toEqual(new Date(2026, 9, 11));
    // A Sunday is the first day of its own week, not the last of the one before.
    expect(weekStart(new Date(2026, 9, 4, 23, 0), 0)).toEqual(new Date(2026, 9, 4));
    const range = weekRangeLabel(weekDays(weekStart(NOW, 0)));
    expect(range).toMatch(/4/);
    expect(range).toMatch(/10/);
    expect(range).toMatch(/Oct/);
    expect(range).toMatch(/2026/);
  });

  it('places an instant in its day and local hour, and nothing outside the week', () => {
    const days = weekDays(weekStart(NOW, 0));
    expect(cellOf(at(8, 18, 30), days)).toEqual({ day: 4, hour: 18 });
    expect(cellOf(at(4, 0), days)).toEqual({ day: 0, hour: 0 });
    expect(cellOf(at(11, 9), days)).toBeNull();
    expect(cellOf(at(3, 23), days)).toBeNull();
  });
});

describe('hourProgress', () => {
  it('is how far through its hour an instant is', () => {
    expect(hourProgress(at(7, 10))).toBe(0);
    expect(hourProgress(at(7, 10, 45))).toBe(0.75);
  });
});

describe('weekCells', () => {
  const days = weekDays(weekStart(NOW, 0));
  const slots = new Map([
    [
      'few',
      [
        { start: at(8, 18), viewerFree: true },
        { start: at(8, 18, 30), viewerFree: false },
      ],
    ],
    ['many', [{ start: at(8, 18, 30), viewerFree: false }]],
    ['hidden', [{ start: at(8, 18), viewerFree: true }]],
  ]);
  const matches: Record<string, number> = { few: 1, many: 4, hidden: 9 };

  it('lists everyone free in an hour once, with their half-hours in it, most matches first', () => {
    const cells = weekCells(slots, days, {
      include: key => key !== 'hidden',
      onlyViewerFree: false,
      order: (left, right) => matches[right.userKey] - matches[left.userKey],
    });

    expect(cells.get('4:18')).toEqual([
      { userKey: 'many', slots: [{ start: at(8, 18, 30), viewerFree: false }] },
      {
        userKey: 'few',
        slots: [
          { start: at(8, 18), viewerFree: true },
          { start: at(8, 18, 30), viewerFree: false },
        ],
      },
    ]);
  });

  it('keeps only half-hours the viewer is free for when asked', () => {
    const cells = weekCells(slots, days, { include: () => true, onlyViewerFree: true, order: () => 0 });
    expect(cells.get('4:18')?.map(cell => cell.userKey)).toEqual(['few', 'hidden']);
  });
});

describe('viewerFreeSlots', () => {
  it("resolves the viewer's saved week into half-hour instants in the zone it was saved in", () => {
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 3, start: 18 * 60, end: 19 * 60 }];
    // Thursday is weekday 3. Saved in UTC, so the instants are the UTC wall clock.
    const free = viewerFreeSlots(blocks, 'UTC', NOW);

    expect(free.has(Date.UTC(2026, 9, 8, 18, 0))).toBe(true);
    expect(free.has(Date.UTC(2026, 9, 8, 18, 30))).toBe(true);
    expect(free.has(Date.UTC(2026, 9, 8, 19, 0))).toBe(false);
    // Next week too.
    expect(free.has(Date.UTC(2026, 9, 15, 18, 0))).toBe(true);
    const keys = viewerFreeCellKeys(free, weekDays(weekStart(NOW, 0)));
    const thursday = cellOf(Date.UTC(2026, 9, 8, 18, 0), weekDays(weekStart(NOW, 0)));
    expect(thursday && keys.has(`${thursday.day}:${thursday.hour}`)).toBe(true);
    expect(keys.size).toBe(1);
  });

  it('is empty without a schedule', () => {
    expect(viewerFreeSlots(undefined, 'UTC', NOW).size).toBe(0);
  });
});

describe('ownDebates', () => {
  const request = (overrides: Partial<ScheduledDebateRequest>): ScheduledDebateRequest => ({
    request_id: 'r1',
    status: 'pending',
    scheduled_start_at: iso(at(8, 18)),
    scheduled_end_at: iso(at(8, 18) + SLOT_MS),
    invited_by_user_id: 'me',
    created_by_admin: false,
    proposed_by_user_id: 'me',
    reschedule_count: 0,
    room_id: null,
    participants: [
      { user_id: 'me', accepted: true },
      { user_id: 'them', accepted: null },
    ],
    viewer_must_answer: false,
    ...overrides,
  });

  it('draws accepted as booked, pending as requested or asked, and drops the rest', () => {
    const debates = ownDebates(
      [
        request({ request_id: 'a', status: 'accepted' }),
        request({ request_id: 'b' }),
        request({ request_id: 'c', viewer_must_answer: true }),
        request({ request_id: 'd', status: 'declined' }),
      ],
      [],
      'me'
    );

    expect(debates.map(debate => [debate.requestId, debate.state, debate.opponentUserId])).toEqual([
      ['a', 'booked', 'them'],
      ['b', 'requested', 'them'],
      ['c', 'asked', 'them'],
    ]);
  });

  it('shows a request this page just sent until the list returns it, then the list wins', () => {
    const sent = request({ request_id: 'new' });
    expect(ownDebates([], [sent], 'me').map(debate => debate.state)).toEqual(['requested']);
    expect(ownDebates([request({ request_id: 'new', status: 'accepted' })], [sent], 'me')[0].state).toBe('booked');
  });
});

describe('firstBusyHour', () => {
  it("is the earliest hour with anyone free or one of the viewer's debates", () => {
    const days = weekDays(weekStart(NOW, 0));
    const cells = new Map([
      ['1:17', []],
      ['4:20', []],
    ]);
    expect(firstBusyHour(cells, [], days)).toBe(17);
    expect(
      firstBusyHour(
        cells,
        [{ requestId: 'x', start: at(9, 8), end: at(9, 8, 30), state: 'booked', opponentUserId: null }],
        days
      )
    ).toBe(8);
    expect(firstBusyHour(new Map(), [], days)).toBeNull();
  });
});
