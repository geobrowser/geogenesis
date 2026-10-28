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
const tzdbNote =
  runtimeTzdb && runtimeTzdb !== vectors.tzdb
    ? ` (zone data differs: vectors ${vectors.tzdb}, runtime ${runtimeTzdb}; a rule change there is not a bug)`
    : '';

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
    const expected = vector.occurrences.map(o => ({ start: Date.parse(o.start), end: Date.parse(o.end) }));
    expect(webSlots(vector), `${vector.name}${tzdbNote}`).toEqual(expected);
    if (vector.length_minutes !== null) {
      for (const o of expected) expect((o.end - o.start) / 60_000).toBe(vector.length_minutes);
    }
  });
});
