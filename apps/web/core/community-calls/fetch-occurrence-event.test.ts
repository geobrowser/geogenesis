import { describe, expect, it } from 'vitest';

import type { Entity } from '~/core/types';

import { CALL_SCHEMA, EVENT_SCHEMA } from './constants';
import { eventOccurrenceStart } from './fetch-occurrence-event';

const SLOT = Date.UTC(2026, 2, 5, 17, 0);

/** Only the shape `eventOccurrenceStart` reads — it never touches the rest of an Entity. */
function eventWith(values: Array<{ propertyId: string; value: string }>): Entity {
  return {
    values: values.map(v => ({ property: { id: v.propertyId }, value: v.value })),
  } as unknown as Entity;
}

const originalStart = (iso: string) => ({
  propertyId: EVENT_SCHEMA.OCCURRENCE_ORIGINAL_START_PROPERTY,
  value: iso,
});
const startTime = (iso: string) => ({ propertyId: EVENT_SCHEMA.START_TIME_PROPERTY, value: iso });
const meetingTime = (schedule: string) => ({ propertyId: CALL_SCHEMA.MEETING_TIME_PROPERTY, value: schedule });

describe('eventOccurrenceStart', () => {
  // The regression: matching read Start time alone. Of the 107 Community call event
  // entities in the graph, 90 carry Occurence original start and only 6 carry Start time,
  // so 101 published occurrences matched nothing — no link from the listing, no published
  // recording detected, and republish duplicating agenda blocks instead of tombstoning.
  it('reads Occurence original start, which is what curator and Rapporteur write', () => {
    const event = eventWith([originalStart('2026-03-05T17:00:00.000Z')]);
    expect(eventOccurrenceStart(event, SLOT)).toBe(SLOT);
  });

  it('still reads Start time, which only geogenesis ever wrote', () => {
    const event = eventWith([startTime('2026-03-05T17:00:00.000Z')]);
    expect(eventOccurrenceStart(event, SLOT)).toBe(SLOT);
  });

  it('prefers the original slot over Start time when both are present', () => {
    // Order matters rather than being incidental: the original slot is pinned precisely so
    // an event maps back to its series slot, and the other two can be moved by an override.
    const event = eventWith([startTime('2026-03-05T19:00:00.000Z'), originalStart('2026-03-05T17:00:00.000Z')]);
    expect(eventOccurrenceStart(event, SLOT)).toBe(SLOT);
  });

  it('falls back to the event Meeting Time when neither datetime is present', () => {
    const event = eventWith([meetingTime('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z')]);
    expect(eventOccurrenceStart(event, SLOT)).toBe(SLOT);
  });

  it('prefers the original slot over a Meeting Time an override moved', () => {
    const event = eventWith([
      meetingTime('DTSTART:20260305T193000Z\nDTEND:20260305T203000Z'),
      originalStart('2026-03-05T17:00:00.000Z'),
    ]);
    expect(eventOccurrenceStart(event, SLOT)).toBe(SLOT);
  });

  it('returns null when the event carries no usable time', () => {
    expect(eventOccurrenceStart(eventWith([]), SLOT)).toBeNull();
  });

  it('returns null rather than NaN for an unparseable datetime', () => {
    // NaN would survive `Number.isFinite` checks downstream as a real-looking candidate.
    expect(eventOccurrenceStart(eventWith([originalStart('not a date')]), SLOT)).toBeNull();
  });
});
