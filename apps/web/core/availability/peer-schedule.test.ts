import { describe, expect, it } from 'vitest';

import type { ScheduleOverlapResponse } from '~/core/debates/api';

import { formatOffset, peerScheduleDays, toPeerSchedule } from './peer-schedule';

const response = (overrides: Partial<ScheduleOverlapResponse> = {}): ScheduleOverlapResponse => ({
  with: 'user-peer',
  both_have_schedules: true,
  viewer_timezone: 'America/New_York',
  with_timezone: 'Europe/Berlin',
  slots: [],
  their_slots: [],
  viewer_has_schedule: true,
  truncated: false,
  ...overrides,
});

/** Their whole week is what the grid reads; `slots` is the suggested-times list beside it. */
const their = (...spans: [start: string, end: string, viewerFree?: boolean][]) =>
  spans.map(([start, end, viewerFree = true]) => ({ start, end, viewer_free: viewerFree }));

describe('toPeerSchedule', () => {
  it('carries the wire fields across', () => {
    const schedule = toPeerSchedule(response({ their_slots: their(['2026-09-21T13:00:00Z', '2026-09-21T13:30:00Z']) }));

    expect(schedule.userId).toBe('user-peer');
    expect(schedule.viewerTimezone).toBe('America/New_York');
    expect(schedule.peerTimezone).toBe('Europe/Berlin');
    expect(schedule.slots).toEqual([
      { start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z', viewerIsFree: true },
    ]);
  });

  // `slots` is the intersection, kept for surfaces wanting suggested times. The grid is `their_slots`.
  it('reads their week, not the intersection beside it', () => {
    const schedule = toPeerSchedule(
      response({
        slots: [{ start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z' }],
        their_slots: their(
          ['2026-09-21T13:00:00Z', '2026-09-21T13:30:00Z', true],
          ['2026-09-21T14:00:00Z', '2026-09-21T14:30:00Z', false]
        ),
      })
    );

    expect(schedule.slots).toHaveLength(2);
    expect(schedule.slots.map(slot => slot.viewerIsFree)).toEqual([true, false]);
  });

  it('takes viewerHasSchedule off the wire', () => {
    expect(toPeerSchedule(response({ viewer_has_schedule: false })).viewerHasSchedule).toBe(false);
    expect(toPeerSchedule(response({ viewer_has_schedule: true })).viewerHasSchedule).toBe(true);
  });

  describe('peerHasSchedule', () => {
    // Their zone is the only field that separates "set nothing" from "nothing free this window".
    it('is false when they have no saved schedule, which the server marks with an empty zone', () => {
      const schedule = toPeerSchedule(response({ with_timezone: '', their_slots: [] }));
      expect(schedule.peerHasSchedule).toBe(false);
    });

    it('is true when they have one but nothing free in the window', () => {
      const schedule = toPeerSchedule(response({ with_timezone: 'Europe/Berlin', their_slots: [] }));
      expect(schedule.peerHasSchedule).toBe(true);
    });

    // The zero-setup case: a shared-link recipient gets their whole week, all dashed.
    it('is independent of whether the viewer has one', () => {
      const schedule = toPeerSchedule(
        response({
          viewer_has_schedule: false,
          their_slots: their(['2026-09-21T13:00:00Z', '2026-09-21T13:30:00Z', false]),
        })
      );

      expect(schedule.peerHasSchedule).toBe(true);
      expect(schedule.viewerHasSchedule).toBe(false);
      expect(schedule.slots.map(slot => slot.viewerIsFree)).toEqual([false]);
    });
  });

  // testnet can sit on an image older than geo-chat#134 for days, and did when this was written.
  describe('a deployment that does not send their_slots', () => {
    // Its `slots` is empty whenever either side is unset, so it says nothing about the peer.
    it('reports their week as unknown rather than as empty', () => {
      const legacy = response({ slots: [{ start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z' }] });
      delete legacy.their_slots;

      const schedule = toPeerSchedule(legacy);

      expect(schedule.theirWeekKnown).toBe(false);
      expect(schedule.slots).toEqual([]);
    });

    it('knows the week whenever the field is present, including when it is empty', () => {
      expect(toPeerSchedule(response({ their_slots: [] })).theirWeekKnown).toBe(true);
    });

    it('reads viewerHasSchedule off both_have_schedules, which still meant the conjunction', () => {
      const legacy = response({ both_have_schedules: false });
      delete legacy.their_slots;
      delete legacy.viewer_has_schedule;

      expect(toPeerSchedule(legacy).viewerHasSchedule).toBe(false);
    });
  });

  // Hard-coded true server-side whenever they have a schedule, so it cannot be trusted.
  it('ignores both_have_schedules', () => {
    const schedule = toPeerSchedule(response({ both_have_schedules: true, viewer_has_schedule: false }));
    expect(schedule.viewerHasSchedule).toBe(false);
  });
});

describe('peerScheduleDays', () => {
  const now = new Date('2026-09-21T15:00:00Z');

  const days = (overrides: Partial<ScheduleOverlapResponse>, at = now) =>
    peerScheduleDays(toPeerSchedule(response(overrides)), at);

  it('draws seven day columns starting today in the viewer zone', () => {
    const result = days({});
    expect(result).toHaveLength(7);
    expect(result.map(day => day.date)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(result[0].weekdayLabel).toBe('Mon');
    expect(result[0].dayLabel).toBe('Sep 21');
    expect(result[0].isToday).toBe(true);
    expect(result.slice(1).every(day => !day.isToday)).toBe(true);
  });

  // Their slots resolve in *their* zone, so a peer east of the viewer has slots on the viewer's
  // today even after the server's UTC-dated window has rolled over.
  describe('the viewer own today', () => {
    it('leads the grid when the server can reach it', () => {
      const evening = new Date('2026-09-22T03:00:00Z');
      const result = days({ viewer_timezone: 'America/Los_Angeles' }, evening);

      expect(result[0].date).toBe('2026-09-21');
      expect(result[0].isToday).toBe(true);
    });

    // Their window opens at their midnight on the UTC date, which for a peer in the viewer's own
    // zone or west of it is after the viewer's evening: nothing could fill that column.
    it('is not drawn when the server window cannot reach it', () => {
      const evening = new Date('2026-09-22T03:00:00Z');
      const result = days({ viewer_timezone: 'America/Los_Angeles', with_timezone: 'America/Los_Angeles' }, evening);

      expect(result[0].date).toBe('2026-09-22');
      expect(result.some(day => day.isToday)).toBe(false);
    });

    it('is not drawn for a peer further west either', () => {
      const evening = new Date('2026-09-22T03:00:00Z');
      const result = days({ viewer_timezone: 'America/New_York', with_timezone: 'America/Los_Angeles' }, evening);

      expect(result[0].date).toBe('2026-09-22');
    });

    // Santiago springs 2026-09-06 00:00 straight to 01:00, so their window opens at 01:00 local
    // and there is no instant whose wall clock is midnight to solve for.
    it('handles a peer zone where local midnight does not exist', () => {
      const result = days(
        { viewer_timezone: 'America/New_York', with_timezone: 'America/Santiago' },
        new Date('2026-09-06T00:07:00Z')
      );

      expect(result[0].date).toBe('2026-09-06');
      expect(result[result.length - 1].date).toBe('2026-09-12');
    });

    // The server resolves the viewer's schedule over the same UTC-dated window, so `viewer_free`
    // is false for every instant before the viewer's own window opens, whatever their calendar
    // says. Those slots must not be reported as "only they are free".
    it('does not claim the viewer is busy before their own window opens', () => {
      const evening = new Date('2026-09-22T03:00:00Z');
      const result = days(
        {
          viewer_timezone: 'America/Los_Angeles',
          with_timezone: 'Asia/Tokyo',
          viewer_has_schedule: true,
          their_slots: their(['2026-09-22T03:00:00Z', '2026-09-22T03:30:00Z', false]),
        },
        evening
      );

      expect(result[0].slots[0].viewerIsFree).toBeNull();
    });

    it('keeps a peer slot that lands on it', () => {
      // Tue 12:00 Tokyo is Mon 20:00 in Los Angeles: tonight, and four hours away.
      const evening = new Date('2026-09-22T03:00:00Z');
      const result = days(
        {
          viewer_timezone: 'America/Los_Angeles',
          with_timezone: 'Asia/Tokyo',
          their_slots: their(['2026-09-22T03:00:00Z', '2026-09-22T03:30:00Z']),
        },
        evening
      );

      expect(result[0].date).toBe('2026-09-21');
      expect(result[0].slots.map(slot => slot.label)).toEqual(['8pm']);
    });
  });

  it('keeps days with nothing in them, so the grid keeps its shape', () => {
    const result = days({ their_slots: their(['2026-09-22T13:00:00Z', '2026-09-22T13:30:00Z']) });
    expect(result.filter(day => day.slots.length === 0)).toHaveLength(6);
  });

  it('buckets a UTC instant into the viewer local day, not the UTC one', () => {
    // 01:00Z on the 23rd is still the evening of the 22nd in New York.
    const result = days({ their_slots: their(['2026-09-23T01:00:00Z', '2026-09-23T01:30:00Z']) });

    expect(result.find(day => day.date === '2026-09-22')?.slots.map(slot => slot.label)).toEqual(['9pm']);
    expect(result.find(day => day.date === '2026-09-23')?.slots).toEqual([]);
  });

  it('splits a long span into slot-sized chips rather than trusting one entry to be one chip', () => {
    const result = days({ their_slots: their(['2026-09-21T17:00:00Z', '2026-09-21T19:00:00Z']) });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['1pm', '1:30pm', '2pm', '2:30pm']);
  });

  it('keeps the last part-slot of a span, because a debate only runs a few minutes', () => {
    const result = days({ their_slots: their(['2026-09-21T17:00:00Z', '2026-09-21T17:45:00Z']) });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['1pm', '1:30pm']);
  });

  it('sorts a day even when the wire did not', () => {
    const result = days({
      their_slots: their(
        ['2026-09-21T20:00:00Z', '2026-09-21T20:30:00Z'],
        ['2026-09-21T14:00:00Z', '2026-09-21T14:30:00Z']
      ),
    });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['10am', '4pm']);
  });

  it('drops a slot outside the drawn week rather than inventing a column', () => {
    const result = days({ their_slots: their(['2026-10-05T13:00:00Z', '2026-10-05T13:30:00Z']) });
    expect(result.flatMap(day => day.slots)).toEqual([]);
  });

  it('ignores a malformed or inverted span', () => {
    const result = days({
      their_slots: their(
        ['not-a-date', '2026-09-21T13:30:00Z'],
        ['2026-09-21T14:00:00Z', '2026-09-21T13:00:00Z'],
        ['2026-09-21T13:00:00Z', '2026-09-21T13:00:00Z']
      ),
    });

    expect(result.flatMap(day => day.slots)).toEqual([]);
  });

  it('carries viewerIsFree onto every chip a span produces', () => {
    const result = days({
      their_slots: their(['2026-09-21T17:00:00Z', '2026-09-21T18:00:00Z', false]),
    });

    expect(result[0].slots.map(slot => slot.viewerIsFree)).toEqual([false, false]);
  });

  describe('timezones', () => {
    it('labels each chip in both zones', () => {
      const result = days({ their_slots: their(['2026-09-21T17:00:00Z', '2026-09-21T17:30:00Z']) });

      // 17:00Z is 1pm in New York (UTC-4 in September) and 7pm in Berlin (UTC+2).
      expect(result[0].slots[0]).toMatchObject({ label: '1pm', peerLabel: '7pm', offsetMinutes: 360 });
    });

    it('handles a half-hour zone without hand-rolling an offset', () => {
      const result = days(
        { with_timezone: 'Asia/Kolkata', their_slots: their(['2026-09-21T17:00:00Z', '2026-09-21T17:30:00Z']) },
        now
      );

      expect(result[0].slots[0]).toMatchObject({ label: '1pm', peerLabel: '10:30pm', offsetMinutes: 570 });
    });

    it('re-resolves the offset across a DST boundary rather than reusing one', () => {
      // Europe ends summer time on 2026-10-25, the US not until 2026-11-01, so the gap between
      // New York and Berlin is six hours before that Sunday and five after it.
      const october = new Date('2026-10-22T15:00:00Z');
      const result = days(
        {
          their_slots: their(
            ['2026-10-23T17:00:00Z', '2026-10-23T17:30:00Z'],
            ['2026-10-26T17:00:00Z', '2026-10-26T17:30:00Z']
          ),
        },
        october
      );

      const before = result.find(day => day.date === '2026-10-23')?.slots[0];
      const after = result.find(day => day.date === '2026-10-26')?.slots[0];

      expect(before).toMatchObject({ label: '1pm', peerLabel: '7pm', offsetMinutes: 360 });
      expect(after).toMatchObject({ label: '1pm', peerLabel: '6pm', offsetMinutes: 300 });
    });

    it('falls back to the browser zone for one Intl will not take', () => {
      const result = days({
        viewer_timezone: 'local',
        with_timezone: 'Mars/Olympus',
        their_slots: their(['2026-09-22T12:00:00Z', '2026-09-22T12:30:00Z']),
      });

      // Both sides resolved in the same fallback zone, so they agree and nothing threw.
      expect(result.flatMap(day => day.slots)).toHaveLength(1);
      expect(result.flatMap(day => day.slots)[0].offsetMinutes).toBe(0);
    });
  });
});

describe('formatOffset', () => {
  it.each([
    [0, 'same time as you'],
    [60, '+1 hr'],
    [360, '+6 hrs'],
    [570, '+9:30 hrs'],
    [-300, '−5 hrs'],
  ])('formats %i as %s', (minutes, expected) => {
    expect(formatOffset(minutes)).toBe(expected);
  });
});
