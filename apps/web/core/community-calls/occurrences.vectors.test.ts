import { describe, expect, it } from 'vitest';

import vectors from './fixtures/call_series_vectors.json';
import { getOccurrences } from './occurrences';

// geo-chat's expander is the reference; refresh the copy with scripts/refresh-call-series-vectors.ts.
type Vector = {
  name: string;
  schedule: string;
  now: string;
  readable: boolean;
  one_off: boolean | null;
  length_minutes: number | null;
  occurrences: { start: string; end: string }[];
};

const DAY_MS = 86_400_000;
const runtimeTzdb = process.versions.tz;
const sameTzdb = !runtimeTzdb || runtimeTzdb === vectors.tzdb;

/** Minutes east of UTC that an instant like `2026-11-05T10:15:00-08:00` was written with; `null` for `Z`. */
function writtenOffset(instant: string) {
  const match = /([+-])(\d{2}):(\d{2})$/.exec(instant);
  if (!match) return null;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

/** Minutes east of UTC in `zone` at `ms`, by this runtime's zone data. */
function runtimeOffset(zone: string, ms: number) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(ms)
    .find(part => part.type === 'timeZoneName')?.value;
  // `GMT-07:00`, or plain `GMT` at UTC.
  return writtenOffset(name ?? '') ?? 0;
}

/**
 * The expected instants where this runtime's zone data gives `zone` another offset than the vectors'
 * did. Always none when both use the same tzdb, or for an instant written in `Z`.
 */
function zoneDrift({ schedule, occurrences }: Pick<Vector, 'schedule' | 'occurrences'>, sameData = sameTzdb) {
  const zone = /^DTSTART;TZID=([^:;]+):/m.exec(schedule)?.[1];
  if (sameData || !zone) return { zone, instants: [] };
  const instants = occurrences
    .flatMap(o => [o.start, o.end])
    .filter(instant => {
      const written = writtenOffset(instant);
      return written !== null && written !== runtimeOffset(zone, Date.parse(instant));
    });
  return { zone, instants };
}

/** The slots geo-chat makes at `now`: after it, up to the horizon, or the year's reach for a one-off. */
function webSlots({ schedule, now, one_off }: Vector) {
  const at = Date.parse(now);
  const reach = (one_off ? vectors.one_off_reach_days : vectors.horizon_days) * DAY_MS;
  return getOccurrences(schedule, at, { futureMs: reach })
    .filter(o => o.startMs > at && o.startMs <= at + reach)
    .map(o => ({ start: o.startMs, end: o.endMs }));
}

describe(`getOccurrences against geo-chat's schedule vectors (tzdb ${vectors.tzdb})`, () => {
  it.each((vectors.cases as Vector[]).map(vector => [vector.name, vector] as const))('%s', (_name, vector) => {
    // A zone whose rules changed between the two tzdb versions cannot match; that is drift, not a bug.
    const drift = zoneDrift(vector);
    if (drift.instants.length > 0) {
      console.warn(
        `${vector.name} skipped: ${drift.zone} has other offsets in tzdb ${runtimeTzdb} than in the vectors' ` +
          `${vectors.tzdb}, at ${drift.instants.join(', ')}. Regenerate the vectors from geo-chat.`
      );
      return;
    }
    const expected = vector.occurrences.map(o => ({ start: Date.parse(o.start), end: Date.parse(o.end) }));
    expect(webSlots(vector), vector.name).toEqual(expected);
    if (vector.length_minutes !== null) {
      for (const o of expected) expect((o.end - o.start) / 60_000).toBe(vector.length_minutes);
    }
  });
});

describe('zoneDrift', () => {
  const schedule = 'DTSTART;TZID=America/Vancouver:20260702T101500\nRRULE:FREQ=WEEKLY';
  // Vancouver is at -07:00 in July under any tzdb.
  const occurrences = [
    { start: '2026-07-02T10:15:00-07:00', end: '2026-07-02T11:15:00-07:00' },
    { start: '2026-07-09T09:15:00-08:00', end: '2026-07-09T10:15:00-08:00' },
  ];

  it('names the instants whose written offset this runtime does not give the zone', () => {
    expect(zoneDrift({ schedule, occurrences }, false)).toEqual({
      zone: 'America/Vancouver',
      instants: ['2026-07-09T09:15:00-08:00', '2026-07-09T10:15:00-08:00'],
    });
  });

  it('finds none under the same tzdb, or for instants written in Z', () => {
    expect(zoneDrift({ schedule, occurrences }, true).instants).toEqual([]);
    const utc = [{ start: '2026-07-09T17:15:00Z', end: '2026-07-09T18:15:00Z' }];
    expect(zoneDrift({ schedule, occurrences: utc }, false).instants).toEqual([]);
  });
});
