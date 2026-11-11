import { describe, expect, it } from 'vitest';

import { type AvailabilityBlock, effectiveAvailability, localTimezone } from './blocks';
import { convertBlocks, scheduleInCurrentZone, scheduleTimezoneNote, timezoneLabel } from './schedule-zone';

const at = (hour: number, minute = 0) => hour * 60 + minute;
// A Wednesday after both the US and the EU have left daylight saving: Los Angeles is 10 hours
// behind Vilnius.
const NOW = new Date('2026-11-04T12:00:00Z');
const LA = 'America/Los_Angeles';
const VILNIUS = 'Europe/Vilnius';

const spans = (blocks: AvailabilityBlock[]) => blocks.map(({ id: _id, ...rest }) => rest);

describe('timezoneLabel', () => {
  it('names a zone the way a person would, with its city', () => {
    expect(timezoneLabel('America/New_York')).toBe('Eastern Time (New York)');
    expect(timezoneLabel('America/Argentina/Buenos_Aires')).toBe('Argentina Standard Time (Buenos Aires)');
    expect(timezoneLabel('Etc/UTC')).toBe('UTC');
    expect(timezoneLabel('local')).toBe('your local time');
    // POSIX signs run backwards, so the bare offset is the only honest name.
    expect(timezoneLabel('Etc/GMT+5')).toBe('GMT-05:00');
  });

  it('falls back to the city for a zone Intl cannot read', () => {
    expect(timezoneLabel('Nowhere/Made_Up')).toBe('Made Up');
  });
});

describe('convertBlocks', () => {
  it('keeps a weekly block at the same instants', () => {
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 1, start: at(9), end: at(10) }];

    expect(spans(convertBlocks(blocks, LA, VILNIUS, NOW))).toEqual([
      { kind: 'recurring', weekday: 1, start: at(19), end: at(20) },
    ]);
  });

  it('moves a block to the next day, and Sunday round to Monday', () => {
    const blocks: AvailabilityBlock[] = [
      { id: 'mon', kind: 'recurring', weekday: 0, start: at(20), end: at(23) },
      { id: 'sun', kind: 'recurring', weekday: 6, start: at(20), end: at(22) },
    ];

    expect(spans(convertBlocks(blocks, LA, VILNIUS, NOW))).toEqual([
      { kind: 'recurring', weekday: 1, start: at(6), end: at(9) },
      { kind: 'recurring', weekday: 0, start: at(6), end: at(8) },
    ]);
  });

  it('splits a block the move carries over midnight', () => {
    const blocks: AvailabilityBlock[] = [
      { id: 'r', kind: 'recurring', weekday: 0, start: at(12), end: at(16) },
      { id: 'd', kind: 'dated', date: '2026-11-10', start: at(13), end: at(15) },
    ];

    expect(spans(convertBlocks(blocks, LA, VILNIUS, NOW))).toEqual([
      { kind: 'recurring', weekday: 0, start: at(22), end: at(24) },
      { kind: 'recurring', weekday: 1, start: at(0), end: at(2) },
      { kind: 'dated', date: '2026-11-10', start: at(23), end: at(24) },
      { kind: 'dated', date: '2026-11-11', start: at(0), end: at(1) },
    ]);
  });

  it('keeps exceptions as exceptions, on their own date', () => {
    const blocks: AvailabilityBlock[] = [{ id: 'x', kind: 'exception', date: '2026-11-12', start: at(9), end: at(12) }];

    expect(spans(convertBlocks(blocks, VILNIUS, LA, NOW))).toEqual([
      { kind: 'exception', date: '2026-11-11', start: at(23), end: at(24) },
      { kind: 'exception', date: '2026-11-12', start: at(0), end: at(2) },
    ]);
  });

  // Saved in Los Angeles as Tuesdays 9–10am but not 6 July, opened in Tokyo in November: the
  // weekly block converts at the winter offset (17h), so the exception has to as well, or it lands
  // an hour off and 6 July's slot comes back.
  it('keeps an exception on the weekly block it cancels across a clock change', () => {
    const blocks: AvailabilityBlock[] = [
      { id: 'r', kind: 'recurring', weekday: 1, start: at(9), end: at(10) },
      { id: 'x', kind: 'exception', date: '2027-07-06', start: at(9), end: at(10) },
    ];
    const converted = convertBlocks(blocks, LA, 'Asia/Tokyo', NOW);

    expect(spans(converted)).toEqual([
      { kind: 'recurring', weekday: 2, start: at(2), end: at(3) },
      { kind: 'exception', date: '2027-07-07', start: at(2), end: at(3) },
    ]);
    const week = ['2027-07-05', '2027-07-06', '2027-07-07', '2027-07-08', '2027-07-09', '2027-07-10', '2027-07-11'];
    expect(effectiveAvailability(converted, week).flatMap(day => day.ranges)).toEqual([]);
  });

  // A dated block converts on its own date, so a summer date uses summer offsets.
  it('converts a dated block with the offsets on its date', () => {
    const blocks: AvailabilityBlock[] = [{ id: 'd', kind: 'dated', date: '2026-07-07', start: at(9), end: at(10) }];

    expect(spans(convertBlocks(blocks, LA, VILNIUS, NOW))).toEqual([
      { kind: 'dated', date: '2026-07-07', start: at(19), end: at(20) },
    ]);
  });

  // The week between the EU and US clock changes: 9 hours apart, not 10.
  it('converts a weekly block with this week’s offsets', () => {
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 1, start: at(9), end: at(10) }];

    expect(spans(convertBlocks(blocks, LA, VILNIUS, new Date('2026-10-28T12:00:00Z')))).toEqual([
      { kind: 'recurring', weekday: 1, start: at(18), end: at(19) },
    ]);
  });

  // Kathmandu is UTC+5:45: 9–11 UTC is 2:45–4:45pm, which shrinks inward to the half-hour grid.
  it('shrinks a quarter-hour shift onto the slot grid rather than offering time not given', () => {
    const blocks: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 2, start: at(9), end: at(11) }];

    expect(spans(convertBlocks(blocks, 'UTC', 'Asia/Kathmandu', NOW))).toEqual([
      { kind: 'recurring', weekday: 2, start: at(15), end: at(16, 30) },
    ]);
  });
});

describe('scheduleInCurrentZone', () => {
  const weekly: AvailabilityBlock[] = [{ id: 'r', kind: 'recurring', weekday: 1, start: at(9), end: at(10) }];

  it('hands back the same blocks when the zone has not changed', () => {
    expect(scheduleInCurrentZone(weekly, VILNIUS, VILNIUS, NOW)).toEqual({ blocks: weekly, converted: false });
    expect(scheduleInCurrentZone(weekly, undefined, VILNIUS, NOW).blocks).toBe(weekly);
    // Two ids for one clock move nothing, so the saved blocks come back as they are.
    expect(scheduleInCurrentZone(weekly, 'America/Detroit', 'America/New_York', NOW).blocks).toBe(weekly);
    // Unreadable, so read as the browser's own zone, which is the zone it is compared against.
    expect(scheduleInCurrentZone(weekly, 'Nowhere/Made_Up', localTimezone(), NOW).converted).toBe(false);
    expect(scheduleInCurrentZone(weekly, 'local', localTimezone(), NOW).converted).toBe(false);
  });

  it('converts a schedule saved elsewhere', () => {
    const { blocks, converted } = scheduleInCurrentZone(weekly, LA, VILNIUS, NOW);
    expect(converted).toBe(true);
    expect(spans(blocks)).toEqual([{ kind: 'recurring', weekday: 1, start: at(19), end: at(20) }]);
  });

  // Phoenix and Denver share a clock in winter only: a weekly block moves in summer and not in
  // winter, and only a block that moved counts as converted.
  it('counts as converted only when a block moved', () => {
    const winter = scheduleInCurrentZone(weekly, 'America/Phoenix', 'America/Denver', NOW);
    expect(winter).toEqual({ blocks: weekly, converted: false });

    const summer = scheduleInCurrentZone(weekly, 'America/Phoenix', 'America/Denver', new Date('2026-07-15T12:00:00Z'));
    expect(summer.converted).toBe(true);
    expect(spans(summer.blocks)).toEqual([{ kind: 'recurring', weekday: 1, start: at(10), end: at(11) }]);
  });

  // Casablanca keeps Algiers' clock in January and July but drops an hour for Ramadan, so a date
  // in those weeks names another instant — however the two zones compare on other days.
  it('converts a dated block in the weeks two otherwise-matching zones part', () => {
    const ramadan: AvailabilityBlock[] = [{ id: 'd', kind: 'dated', date: '2026-02-25', start: at(9), end: at(10) }];

    const { blocks, converted } = scheduleInCurrentZone(ramadan, 'Africa/Casablanca', 'Africa/Algiers', NOW);
    expect(converted).toBe(true);
    expect(spans(blocks)).toEqual([{ kind: 'dated', date: '2026-02-25', start: at(10), end: at(11) }]);
  });

  it('has nothing to convert in an empty week', () => {
    expect(scheduleInCurrentZone([], LA, VILNIUS, NOW).converted).toBe(false);
  });
});

describe('scheduleTimezoneNote', () => {
  it('names only the current zone when nothing was converted', () => {
    expect(scheduleTimezoneNote({ savedTimezone: LA, currentTimezone: 'America/New_York', converted: false })).toBe(
      'Times are in Eastern Time (New York).'
    );
  });

  it('says where converted times came from', () => {
    expect(scheduleTimezoneNote({ savedTimezone: LA, currentTimezone: VILNIUS, converted: true })).toBe(
      'Times are in Eastern European Time (Vilnius), converted from Pacific Time (Los Angeles) where you set them.'
    );
  });
});
