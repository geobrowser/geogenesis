import { describe, expect, it } from 'vitest';

import { bucketOccurrences, findOccurrenceByStart, getOccurrences } from './occurrences';

// Fixed "now" so the windowed expansion is deterministic.
const NOW = Date.UTC(2026, 2, 5, 17, 30); // 2026-03-05 17:30 UTC

describe('getOccurrences', () => {
  it('returns a single occurrence for a non-recurring schedule in window', () => {
    const occ = getOccurrences('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z', NOW);
    expect(occ).toHaveLength(1);
    expect(occ[0].startMs).toBe(Date.UTC(2026, 2, 5, 17, 0));
    expect(occ[0].endMs).toBe(Date.UTC(2026, 2, 5, 18, 0));
  });

  it('expands a weekly series onto the right weekday', () => {
    // 2026-03-05 is a Thursday; weekly on Thursdays.
    const occ = getOccurrences('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH', NOW);
    expect(occ.length).toBeGreaterThan(1);
    for (const o of occ) expect(new Date(o.startMs).getUTCDay()).toBe(4); // Thursday
  });

  it('never emits a BYDAY occurrence before DTSTART', () => {
    // DTSTART is a Thursday; BYDAY includes Monday, which falls earlier in the same week.
    const occ = getOccurrences('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=MO,TH', NOW);
    const baseStart = Date.UTC(2026, 2, 5, 17, 0);
    for (const o of occ) expect(o.startMs).toBeGreaterThanOrEqual(baseStart);
  });

  it('respects a bi-weekly interval', () => {
    const occ = getOccurrences('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2', NOW);
    expect(occ[1].startMs - occ[0].startMs).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('converts a TZID-zoned DTSTART to the right UTC instant (curator format)', () => {
    // Curator's real format: 13:00 in America/Santiago (UTC-4 in April) = 17:00 UTC.
    const apr = Date.UTC(2026, 3, 8, 12, 0); // a Wednesday, in-window of the series
    const occ = getOccurrences(
      'DTSTART;TZID=America/Santiago:20260408T130000\nDTEND;TZID=America/Santiago:20260408T140000\nRRULE:FREQ=WEEKLY;BYDAY=WE',
      apr
    );
    expect(occ.length).toBeGreaterThan(0);
    const first = occ.find(o => new Date(o.startMs).getUTCMonth() === 3 && new Date(o.startMs).getUTCDate() === 8)!;
    expect(first.startMs).toBe(Date.UTC(2026, 3, 8, 17, 0)); // 13:00 -04:00 → 17:00 UTC
    for (const o of occ) expect(new Date(o.startMs).getUTCDay()).toBe(3); // Wednesday
  });

  it('preserves the local wall-clock time across a US spring-forward DST transition', () => {
    // US DST starts 2026-03-08 (2nd Sunday of March). A recurring 09:00 America/Los_Angeles
    // call must land at 17:00 UTC (PST, UTC-8) before the transition and 16:00 UTC (PDT,
    // UTC-7) after it — the local hour (9am) stays fixed; the UTC instant shifts.
    const mid = Date.UTC(2026, 2, 10, 12, 0);
    const occ = getOccurrences(
      'DTSTART;TZID=America/Los_Angeles:20260301T090000\nDTEND;TZID=America/Los_Angeles:20260301T100000\nRRULE:FREQ=WEEKLY;BYDAY=SU',
      mid
    );
    const beforeDst = occ.find(o => new Date(o.startMs).getUTCMonth() === 2 && new Date(o.startMs).getUTCDate() === 1);
    const afterDst = occ.find(o => new Date(o.startMs).getUTCMonth() === 2 && new Date(o.startMs).getUTCDate() === 8);
    expect(beforeDst?.startMs).toBe(Date.UTC(2026, 2, 1, 17, 0));
    expect(afterDst?.startMs).toBe(Date.UTC(2026, 2, 8, 16, 0));
  });
});

describe('bucketOccurrences', () => {
  it('marks the in-window occurrence live and splits past/upcoming', () => {
    const occ = getOccurrences('DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH', NOW);
    const { live, upcoming, past } = bucketOccurrences(occ, NOW);
    expect(live).not.toBeNull();
    expect(live!.startMs).toBe(Date.UTC(2026, 2, 5, 17, 0));
    expect(upcoming.every(o => o.startMs > NOW)).toBe(true);
    expect(past.every(o => o.endMs < NOW)).toBe(true);
  });
});

// Anything acting on the occurrence a user actually joined must resolve it from the
// server's `occurrenceStart`, not from "what is live now". A page open across a boundary
// disagrees, and acting on the wrong occurrence put the forced end-of-call cutoff in the
// past — which disconnects the moment it is evaluated (GEO-2584).
describe('findOccurrenceByStart', () => {
  const WEEKLY = 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH';

  it('resolves the occurrence for an exact start', () => {
    const start = Date.UTC(2026, 2, 12, 17, 0); // the following Thursday
    expect(findOccurrenceByStart(WEEKLY, start)?.endMs).toBe(Date.UTC(2026, 2, 12, 18, 0));
  });

  it('resolves a start that is near-miss rather than identical', () => {
    // The server's instant need not match the locally expanded one to the millisecond.
    const start = Date.UTC(2026, 2, 12, 17, 0) + 60_000;
    expect(findOccurrenceByStart(WEEKLY, start)?.startMs).toBe(Date.UTC(2026, 2, 12, 17, 0));
  });

  // The point of the helper: expansion is centred on the target, not on `now`. This start
  // is deliberately outside the +180-day expansion window measured from NOW, so a version
  // that expanded around `now` would miss it — as the assertion below asserts directly.
  it('resolves an occurrence outside the window that `now` would expand', () => {
    const farStart = Date.UTC(2027, 2, 4, 17, 0); // ~1 year on, still a Thursday
    expect(getOccurrences(WEEKLY, NOW).some(o => o.startMs === farStart)).toBe(false);
    expect(findOccurrenceByStart(WEEKLY, farStart)?.endMs).toBe(Date.UTC(2027, 2, 4, 18, 0));
  });

  it('returns null when nothing lands within tolerance', () => {
    const notAnOccurrence = Date.UTC(2026, 2, 10, 3, 0); // a Tuesday at 03:00
    expect(findOccurrenceByStart(WEEKLY, notAnOccurrence)).toBeNull();
  });

  it('returns null for an empty schedule rather than throwing', () => {
    expect(findOccurrenceByStart('', Date.UTC(2026, 2, 12, 17, 0))).toBeNull();
  });
});
