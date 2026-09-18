import { describe, expect, it } from 'vitest';

import type { Value } from '~/core/types';

import { EVENT_SCHEMA } from './constants';
import { MEETING_TIME_PROPERTY, eventPhase, formatTimeUntil, resolveEventTiming } from './event-timing';

function value(propertyId: string, raw: string, overrides: Partial<Value> = {}): Value {
  return {
    id: `${propertyId}-value`,
    entity: { id: 'event', name: null },
    property: { id: propertyId, name: 'Property', dataType: 'TEXT' },
    value: raw,
    spaceId: 'space',
    ...overrides,
  } as Value;
}

describe('resolveEventTiming', () => {
  it('reads Start time and End time, which is what this app publishes', () => {
    const timing = resolveEventTiming([
      value(EVENT_SCHEMA.START_TIME_PROPERTY, '2026-07-10T19:43:09Z'),
      value(EVENT_SCHEMA.END_TIME_PROPERTY, '2026-07-10T20:43:09Z'),
    ]);

    expect(timing).toEqual({ startMs: Date.parse('2026-07-10T19:43:09Z'), endMs: Date.parse('2026-07-10T20:43:09Z') });
  });

  // The shape 100 of 107 testnet events actually carry. A reader that knows only the pair above
  // finds no date on almost every real event.
  it('falls back to the Meeting Time schedule', () => {
    const timing = resolveEventTiming([
      value(MEETING_TIME_PROPERTY, 'DTSTART:20260521T090000Z\nDTEND:20260521T110000Z'),
    ]);

    expect(timing).toEqual({ startMs: Date.parse('2026-05-21T09:00:00Z'), endMs: Date.parse('2026-05-21T11:00:00Z') });
  });

  it('reads a TZID schedule as wall-clock in its own zone, not as UTC', () => {
    const timing = resolveEventTiming([
      value(
        MEETING_TIME_PROPERTY,
        'DTSTART;TZID=America/Los_Angeles:20260521T090000\nDTEND;TZID=America/Los_Angeles:20260521T100000'
      ),
    ]);

    // 09:00 in Los Angeles on that date is 16:00Z (PDT, UTC-7).
    expect(timing?.startMs).toBe(Date.parse('2026-05-21T16:00:00Z'));
    expect(timing?.endMs).toBe(Date.parse('2026-05-21T17:00:00Z'));
  });

  it('carries a DTEND past midnight into the next day rather than backwards', () => {
    const timing = resolveEventTiming([
      value(MEETING_TIME_PROPERTY, 'DTSTART:20260521T233000Z\nDTEND:20260522T003000Z'),
    ]);

    expect(timing?.endMs).toBe(Date.parse('2026-05-22T00:30:00Z'));
    expect(timing!.endMs! - timing!.startMs).toBe(60 * 60 * 1000);
  });

  it('falls back to Occurence original start, which carries no end', () => {
    const timing = resolveEventTiming([value(EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY, '2026-05-21T09:00:00Z')]);

    expect(timing).toEqual({ startMs: Date.parse('2026-05-21T09:00:00Z'), endMs: null });
  });

  it('prefers the published sitting over the slot it was scheduled for', () => {
    const timing = resolveEventTiming([
      value(MEETING_TIME_PROPERTY, 'DTSTART:20260521T090000Z\nDTEND:20260521T110000Z'),
      value(EVENT_SCHEMA.START_TIME_PROPERTY, '2026-05-21T09:04:00Z'),
      value(EVENT_SCHEMA.END_TIME_PROPERTY, '2026-05-21T10:11:00Z'),
    ]);

    expect(timing?.startMs).toBe(Date.parse('2026-05-21T09:04:00Z'));
  });

  it('ignores a deleted value rather than dating the event by it', () => {
    const timing = resolveEventTiming([
      value(EVENT_SCHEMA.START_TIME_PROPERTY, '2026-07-10T19:43:09Z', { isDeleted: true }),
      value(EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY, '2026-05-21T09:00:00Z'),
    ]);

    expect(timing?.startMs).toBe(Date.parse('2026-05-21T09:00:00Z'));
  });

  it('returns null when the event carries no time at all', () => {
    expect(resolveEventTiming([value(EVENT_SCHEMA.DESCRIPTION_PROPERTY, 'A call')])).toBeNull();
    expect(resolveEventTiming([])).toBeNull();
  });

  it('returns null rather than NaN for an unparseable value', () => {
    expect(resolveEventTiming([value(EVENT_SCHEMA.START_TIME_PROPERTY, 'sometime next week')])).toBeNull();
  });
});

describe('eventPhase', () => {
  const start = Date.parse('2026-05-21T09:00:00Z');
  const end = Date.parse('2026-05-21T11:00:00Z');

  it('reports upcoming, live and past around the sitting', () => {
    expect(eventPhase({ startMs: start, endMs: end }, start - 1)).toBe('upcoming');
    expect(eventPhase({ startMs: start, endMs: end }, start)).toBe('live');
    expect(eventPhase({ startMs: start, endMs: end }, end)).toBe('live');
    expect(eventPhase({ startMs: start, endMs: end }, end + 1)).toBe('past');
  });

  it('gives an event with no end an assumed hour before calling it past', () => {
    expect(eventPhase({ startMs: start, endMs: null }, start + 59 * 60 * 1000)).toBe('live');
    expect(eventPhase({ startMs: start, endMs: null }, start + 61 * 60 * 1000)).toBe('past');
  });

  it('is undated when there is no timing, which is a state the page has to draw', () => {
    expect(eventPhase(null, start)).toBe('undated');
  });
});

describe('formatTimeUntil', () => {
  const now = Date.parse('2026-05-21T09:00:00Z');
  const until = (offsetMs: number) => formatTimeUntil(now + offsetMs, now);

  it('steps up through the units as the call gets further away', () => {
    expect(until(30 * 1000)).toBe('in under a minute');
    expect(until(9 * 60 * 1000)).toBe('in 9 minutes');
    expect(until(3 * 60 * 60 * 1000)).toBe('in 3 hours');
    expect(until(3 * 24 * 60 * 60 * 1000)).toBe('in 3 days');
    expect(until(14 * 24 * 60 * 60 * 1000)).toBe('in 2 weeks');
    expect(until(60 * 24 * 60 * 60 * 1000)).toBe('in 2 months');
  });

  it('singularises rather than saying "in 1 days"', () => {
    expect(until(60 * 1000)).toBe('in 1 minute');
    expect(until(60 * 60 * 1000)).toBe('in 1 hour');
    expect(until(24 * 60 * 60 * 1000)).toBe('in 1 day');
  });

  it('says now once the start has passed, so a live call never reads as upcoming', () => {
    expect(until(0)).toBe('now');
    expect(until(-60 * 1000)).toBe('now');
  });
});
