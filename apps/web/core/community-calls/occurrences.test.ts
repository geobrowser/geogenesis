import { describe, expect, it } from 'vitest';

import { bucketOccurrences, findOccurrenceByStart, getOccurrences } from './occurrences';

// Fixed "now" so the windowed expansion is deterministic.
const NOW = Date.UTC(2026, 2, 5, 17, 30); // 2026-03-05 17:30 UTC

describe('getOccurrences', () => {
  it('lasts as long as its DTEND says from 15 minutes, and an hour otherwise', () => {
    const length = (schedule: string) => {
      const [occ] = getOccurrences(schedule, Date.parse('2026-10-26T00:00:00Z'));
      return (occ!.endMs - occ!.startMs) / 60_000;
    };
    expect(length('DTSTART:20261105T170000Z\nDTEND:20261105T171500Z')).toBe(15);
    expect(length('DTSTART:20261105T170000Z\nDTEND:20261105T173000Z')).toBe(30);
    expect(length('DTSTART:20261105T170000Z\nDTEND:20261105T193000Z')).toBe(150);
    expect(length('DTSTART:20261105T170000Z\nDTEND:20261105T171000Z')).toBe(60);
    expect(length('DTSTART:20261105T170000Z\nDTEND:20261105T170000Z')).toBe(60);
    expect(length('DTSTART:20261105T170000Z')).toBe(60);
  });

  // Parity with geo-chat's `parse_time` (call_series.rs).
  it('reads a skipped start an hour on, and a repeated one at its earlier instant', () => {
    const skipped = getOccurrences('DTSTART;TZID=America/New_York:20260308T023000', Date.parse('2026-03-01T00:00:00Z'));
    expect(new Date(skipped[0]!.startMs).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    const repeated = getOccurrences(
      'DTSTART;TZID=America/New_York:20261101T013000',
      Date.parse('2026-10-25T00:00:00Z')
    );
    expect(new Date(repeated[0]!.startMs).toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });

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

describe('getOccurrences against geo-chat (RFC 5545)', () => {
  const DAY = 86_400_000;
  // The next 42 days, as geo-chat's parity fixture reads them.
  const slots = (schedule: string, now: string) => {
    const at = Date.parse(now);
    return getOccurrences(schedule, at)
      .filter(o => o.startMs > at && o.startMs <= at + 42 * DAY)
      .map(o => [new Date(o.startMs).toISOString(), new Date(o.endMs).toISOString()]);
  };

  it('reads an ordinal monthly BYDAY as the nth weekday', () => {
    expect(
      slots(
        'DTSTART;TZID=Europe/London:20260518T130000\nDTEND;TZID=Europe/London:20260518T140000\nRRULE:FREQ=MONTHLY;BYDAY=3MO',
        '2026-10-26T00:00:00Z'
      )
    ).toEqual([['2026-11-16T13:00:00.000Z', '2026-11-16T14:00:00.000Z']]);
  });

  it('counts a negative ordinal from the month end, and skips a month without the nth weekday', () => {
    const lastFriday = getOccurrences(
      'DTSTART:20261030T170000Z\nDTEND:20261030T180000Z\nRRULE:FREQ=MONTHLY;BYDAY=-1FR',
      Date.UTC(2026, 9, 1)
    ).map(o => new Date(o.startMs).toISOString().slice(0, 10));
    expect(lastFriday.slice(0, 3)).toEqual(['2026-10-30', '2026-11-27', '2026-12-25']);

    // A fifth Monday: Nov 2026 has one (30th), Dec 2026 does not, Feb 2027 does not, Mar 2027 does (29th).
    const fifthMonday = getOccurrences(
      'DTSTART:20261130T170000Z\nRRULE:FREQ=MONTHLY;BYDAY=5MO',
      Date.UTC(2026, 10, 1)
    ).map(o => new Date(o.startMs).toISOString().slice(0, 10));
    expect(fifthMonday.slice(0, 2)).toEqual(['2026-11-30', '2027-03-29']);
  });

  it('reads an end earlier on the clock than the start as the next day', () => {
    expect(
      slots(
        'DTSTART;TZID=Europe/London:20261105T220000\nDTEND;TZID=Europe/London:20261106T003000',
        '2026-10-26T00:00:00Z'
      )
    ).toEqual([['2026-11-05T22:00:00.000Z', '2026-11-06T00:30:00.000Z']]);
  });

  it('keeps a monthly series without BYDAY on its day of month, skipping short months', () => {
    expect(
      slots('DTSTART:20261031T150000Z\nDTEND:20261031T160000Z\nRRULE:FREQ=MONTHLY', '2026-12-15T00:00:00Z')
    ).toEqual([['2026-12-31T15:00:00.000Z', '2026-12-31T16:00:00.000Z']]);
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

  // The regression this guards: every discovery surface buckets through this function, so
  // filing a still-running call under `past` at its scheduled end made an overrunning
  // meeting unfindable while it was happening — the rail and listings advertised next
  // week's occurrence instead.
  const SERIES = 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH';
  const SCHEDULED_END = Date.UTC(2026, 2, 5, 18, 0);

  it('keeps a call live past its scheduled end for as long as it can still be joined', () => {
    const tenPastEnd = SCHEDULED_END + 10 * 60 * 1000;
    const { live, past } = bucketOccurrences(getOccurrences(SERIES, tenPastEnd), tenPastEnd);

    expect(live?.startMs).toBe(Date.UTC(2026, 2, 5, 17, 0));
    expect(past.some(o => o.startMs === Date.UTC(2026, 2, 5, 17, 0))).toBe(false);
  });

  it('does not advertise the next occurrence while the current one is still running', () => {
    const tenPastEnd = SCHEDULED_END + 10 * 60 * 1000;
    const { live, upcoming } = bucketOccurrences(getOccurrences(SERIES, tenPastEnd), tenPastEnd);

    // A weekly series: getting this wrong points people at a call seven days away.
    expect(live).not.toBeNull();
    expect(upcoming[0]?.startMs).toBe(Date.UTC(2026, 2, 12, 17, 0));
  });

  it('files the call under past once the join window has closed', () => {
    const afterJoinWindow = SCHEDULED_END + 26 * 60 * 1000;
    const { live, past } = bucketOccurrences(getOccurrences(SERIES, afterJoinWindow), afterJoinWindow);

    expect(live).toBeNull();
    expect(past[0]?.startMs).toBe(Date.UTC(2026, 2, 5, 17, 0));
  });

  it('does not call an occurrence live before it has started', () => {
    // `isOccurrenceLive` admits people 15 minutes early; the badge must not claim the
    // meeting is under way when it is not.
    const fiveBeforeStart = Date.UTC(2026, 2, 5, 16, 55);
    const { live, upcoming } = bucketOccurrences(getOccurrences(SERIES, fiveBeforeStart), fiveBeforeStart);

    expect(live).toBeNull();
    expect(upcoming[0]?.startMs).toBe(Date.UTC(2026, 2, 5, 17, 0));
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
