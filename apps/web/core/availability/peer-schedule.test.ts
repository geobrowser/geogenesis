import { describe, expect, it } from 'vitest';

import type { ScheduleOverlapResponse } from '~/core/debates/api';

import { formatOffset, peerScheduleDays, toPeerSchedule } from './peer-schedule';

const response = (overrides: Partial<ScheduleOverlapResponse> = {}): ScheduleOverlapResponse => ({
  with: 'user-peer',
  both_have_schedules: true,
  viewer_timezone: 'America/New_York',
  with_timezone: 'Europe/Berlin',
  slots: [],
  truncated: false,
  ...overrides,
});

describe('toPeerSchedule', () => {
  it('carries the wire fields across', () => {
    const schedule = toPeerSchedule(
      response({ slots: [{ start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z' }], truncated: true }),
      { viewerHasSchedule: true }
    );

    expect(schedule.userId).toBe('user-peer');
    expect(schedule.viewerTimezone).toBe('America/New_York');
    expect(schedule.peerTimezone).toBe('Europe/Berlin');
    expect(schedule.truncated).toBe(true);
    expect(schedule.slots).toEqual([
      { start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z', viewerIsFree: true },
    ]);
  });

  it('treats a slot with no flag as mutual, because that is all the endpoint sends', () => {
    const schedule = toPeerSchedule(
      response({ slots: [{ start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z' }] }),
      { viewerHasSchedule: true }
    );

    expect(schedule.slots[0].viewerIsFree).toBe(true);
  });

  it('honours a per-slot flag once the endpoint sends one', () => {
    const schedule = toPeerSchedule(
      response({
        slots: [
          { start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:30:00Z', viewer_is_free: false },
          { start: '2026-09-21T14:00:00Z', end: '2026-09-21T14:30:00Z', viewer_is_free: true },
        ],
      }),
      { viewerHasSchedule: true }
    );

    expect(schedule.slots.map(slot => slot.viewerIsFree)).toEqual([false, true]);
  });

  describe('both_have_schedules', () => {
    it('is both of them when true', () => {
      const schedule = toPeerSchedule(response({ both_have_schedules: true }), { viewerHasSchedule: true });
      expect(schedule.peerHasSchedule).toBe(true);
      expect(schedule.viewerHasSchedule).toBe(true);
    });

    it('pins the peer down only when the viewer is known to have one', () => {
      const schedule = toPeerSchedule(response({ both_have_schedules: false }), { viewerHasSchedule: true });
      expect(schedule.peerHasSchedule).toBe(false);
    });

    it('says nothing about the peer when the viewer has no schedule either', () => {
      const schedule = toPeerSchedule(response({ both_have_schedules: false }), { viewerHasSchedule: false });
      expect(schedule.peerHasSchedule).toBeNull();
      expect(schedule.viewerHasSchedule).toBe(false);
    });

    it('returns no slots, which is the zero-setup case the view still has to draw', () => {
      const schedule = toPeerSchedule(response({ both_have_schedules: false, slots: [] }), {
        viewerHasSchedule: false,
      });
      expect(schedule.slots).toEqual([]);
    });
  });
});

describe('peerScheduleDays', () => {
  const now = new Date('2026-09-21T15:00:00Z');

  const days = (overrides: Partial<ScheduleOverlapResponse>, at = now) =>
    peerScheduleDays(toPeerSchedule(response(overrides), { viewerHasSchedule: true }), at);

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
  });

  it('keeps days with nothing in them, so the grid keeps its shape', () => {
    const result = days({ slots: [{ start: '2026-09-22T13:00:00Z', end: '2026-09-22T13:30:00Z' }] });
    expect(result.filter(day => day.slots.length === 0)).toHaveLength(6);
  });

  it('buckets a UTC instant into the viewer local day, not the UTC one', () => {
    // 01:00Z on the 23rd is still the evening of the 22nd in New York.
    const result = days({ slots: [{ start: '2026-09-23T01:00:00Z', end: '2026-09-23T01:30:00Z' }] });

    expect(result.find(day => day.date === '2026-09-22')?.slots.map(slot => slot.label)).toEqual(['9pm']);
    expect(result.find(day => day.date === '2026-09-23')?.slots).toEqual([]);
  });

  it('splits a long span into slot-sized chips rather than trusting one entry to be one chip', () => {
    const result = days({ slots: [{ start: '2026-09-21T17:00:00Z', end: '2026-09-21T19:00:00Z' }] });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['1pm', '1:30pm', '2pm', '2:30pm']);
  });

  it('keeps the last part-slot of a span, because a debate only runs a few minutes', () => {
    const result = days({ slots: [{ start: '2026-09-21T17:00:00Z', end: '2026-09-21T17:45:00Z' }] });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['1pm', '1:30pm']);
  });

  it('sorts a day even when the wire did not', () => {
    const result = days({
      slots: [
        { start: '2026-09-21T20:00:00Z', end: '2026-09-21T20:30:00Z' },
        { start: '2026-09-21T14:00:00Z', end: '2026-09-21T14:30:00Z' },
      ],
    });

    expect(result[0].slots.map(slot => slot.label)).toEqual(['10am', '4pm']);
  });

  it('drops a slot outside the drawn week rather than inventing a column', () => {
    const result = days({ slots: [{ start: '2026-10-05T13:00:00Z', end: '2026-10-05T13:30:00Z' }] });
    expect(result.flatMap(day => day.slots)).toEqual([]);
  });

  it('ignores a malformed or inverted span', () => {
    const result = days({
      slots: [
        { start: 'not-a-date', end: '2026-09-21T13:30:00Z' },
        { start: '2026-09-21T14:00:00Z', end: '2026-09-21T13:00:00Z' },
        { start: '2026-09-21T13:00:00Z', end: '2026-09-21T13:00:00Z' },
      ],
    });

    expect(result.flatMap(day => day.slots)).toEqual([]);
  });

  it('carries viewerIsFree onto every chip a span produces', () => {
    const result = days({
      slots: [{ start: '2026-09-21T17:00:00Z', end: '2026-09-21T18:00:00Z', viewer_is_free: false }],
    });

    expect(result[0].slots.map(slot => slot.viewerIsFree)).toEqual([false, false]);
  });

  describe('timezones', () => {
    it('labels each chip in both zones', () => {
      const result = days({ slots: [{ start: '2026-09-21T17:00:00Z', end: '2026-09-21T17:30:00Z' }] });

      // 17:00Z is 1pm in New York (UTC-4 in September) and 7pm in Berlin (UTC+2).
      expect(result[0].slots[0]).toMatchObject({ label: '1pm', peerLabel: '7pm', offsetMinutes: 360 });
    });

    it('handles a half-hour zone without hand-rolling an offset', () => {
      const result = days(
        { with_timezone: 'Asia/Kolkata', slots: [{ start: '2026-09-21T17:00:00Z', end: '2026-09-21T17:30:00Z' }] },
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
          slots: [
            { start: '2026-10-23T17:00:00Z', end: '2026-10-23T17:30:00Z' },
            { start: '2026-10-26T17:00:00Z', end: '2026-10-26T17:30:00Z' },
          ],
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
        slots: [{ start: '2026-09-22T12:00:00Z', end: '2026-09-22T12:30:00Z' }],
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
