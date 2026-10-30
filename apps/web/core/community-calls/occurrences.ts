/**
 * Expand an iCalendar schedule string into concrete occurrences and bucket them
 * into live / upcoming / past. Mirrors curator's `getNextOccurrences` /
 * `isOccurrenceLive`, reusing geogenesis's existing schedule parser.
 */
import { MIN_CALL_DURATION_MINUTES, isValidTimeZone, localToUtcMs, parseSchedule } from '~/core/utils/schedule';

import { LIVE_WINDOW_AFTER_MS, OCCURRENCE_MATCH_TOLERANCE_MS } from './constants';
import { Occurrence } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const BYDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
/** Past the window on the wall clock: no zone is a day off UTC, so stepping stops here. */
const ZONE_SLACK_MS = DAY_MS;

// How far back/forward we expand recurring series for the listing, plus a hard
// iteration cap so a malformed RRULE can never loop unbounded.
const PAST_WINDOW_MS = 60 * DAY_MS;
const FUTURE_WINDOW_MS = 180 * DAY_MS;
const MAX_OCCURRENCES = 500;

/** `MONTHLY;BYDAY=3MO` or `-1FR`: the nth weekday of the month, counted from the end when negative. */
function parseOrdinalByDay(byDay: string[]): { n: number; weekday: number }[] {
  return byDay.flatMap(token => {
    const match = /^([+-]?\d{1,2})([A-Z]{2})$/.exec(token);
    const weekday = match ? BYDAY_INDEX[match[2]] : undefined;
    const n = match ? Number(match[1]) : 0;
    return weekday === undefined || n === 0 ? [] : [{ n, weekday }];
  });
}

/** Day of month of the nth `weekday` in a month (0-based month), or null when it has none. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number | null {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (n > 0) {
    const first = (weekday - new Date(Date.UTC(year, month, 1)).getUTCDay() + 7) % 7;
    const day = 1 + first + (n - 1) * 7;
    return day <= daysInMonth ? day : null;
  }
  const last = (new Date(Date.UTC(year, month, daysInMonth)).getUTCDay() - weekday + 7) % 7;
  const day = daysInMonth - last + (n + 1) * 7;
  return day >= 1 ? day : null;
}

function toMs(dateStr: string, time: string, seconds = 0): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h || 0, min || 0, seconds);
}

/**
 * Converts a "naive" ms value (wall-clock digits stamped as if UTC) to a true UTC
 * instant when `tz` is set, re-deriving the zone's offset fresh at that instant —
 * this is what makes recurrence DST-correct: each occurrence's real UTC offset is
 * looked up at its own date rather than inherited from the series' first occurrence.
 */
function toTrueMs(naiveMs: number, tz: string | undefined): number {
  return tz ? localToUtcMs(naiveMs, tz) : naiveMs;
}

/** Expand a schedule into occurrences within [now - 60d, now + `futureMs`], 180 days by default. */
export function getOccurrences(
  schedule: string,
  now = Date.now(),
  { futureMs = FUTURE_WINDOW_MS }: { futureMs?: number } = {}
): Occurrence[] {
  const parsed = parseSchedule(schedule);
  // What geo-chat cannot read makes no calls.
  if (!parsed.startDate) return [];
  if (parsed.timezone && !isValidTimeZone(parsed.timezone)) return [];
  if (parsed.freq && !FREQUENCIES.has(parsed.freq)) return [];

  // All stepping arithmetic below (weekBase/startMs) stays in "naive" ms — wall-clock
  // calendar math (add N days/weeks/months) is timezone-agnostic by nature. Only the
  // final occurrence instants get converted to true UTC via `toTrueMs`, once per
  // occurrence, so each one picks up the correct offset for its own date.
  const baseStart = toMs(parsed.startDate, parsed.startTime, parsed.startSeconds);
  // An end earlier on the clock than the start is the next day's (RFC 5545; geo-chat agrees).
  const sameDayEnd = parsed.endTime ? toMs(parsed.startDate, parsed.endTime, parsed.endSeconds) : null;
  const endMs = sameDayEnd !== null && sameDayEnd < baseStart ? sameDayEnd + DAY_MS : sameDayEnd;
  // geo-chat's rule: the DTEND's length when it is at least 15 minutes, otherwise an hour.
  const length = endMs !== null ? endMs - baseStart : null;
  const duration = length !== null && length >= MIN_CALL_DURATION_MINUTES * 60_000 ? length : DEFAULT_DURATION_MS;

  const windowStart = now - PAST_WINDOW_MS;
  const windowEnd = now + futureMs;
  const steppingEnd = windowEnd + ZONE_SLACK_MS;
  const interval = Math.max(parsed.interval, 1);

  // Non-recurring: the single instance.
  if (!parsed.freq) {
    const trueStart = toTrueMs(baseStart, parsed.timezone);
    return trueStart + duration >= windowStart && trueStart <= windowEnd
      ? [{ startMs: trueStart, endMs: trueStart + duration }]
      : [];
  }

  const starts: number[] = [];
  const push = (naiveStartMs: number) => {
    if (naiveStartMs < baseStart) return;
    const trueStartMs = toTrueMs(naiveStartMs, parsed.timezone);
    if (trueStartMs + duration >= windowStart && trueStartMs <= windowEnd) starts.push(trueStartMs);
  };

  const base = new Date(baseStart);
  const ordinals = parsed.freq === 'MONTHLY' ? parseOrdinalByDay(parsed.byDay) : [];

  if (ordinals.length > 0) {
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      const month = Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + i * interval, 1);
      if (month > steppingEnd) break;
      const at = new Date(month);
      for (const { n, weekday } of ordinals) {
        const day = nthWeekdayOfMonth(at.getUTCFullYear(), at.getUTCMonth(), weekday, n);
        if (day !== null) {
          push(
            Date.UTC(
              at.getUTCFullYear(),
              at.getUTCMonth(),
              day,
              base.getUTCHours(),
              base.getUTCMinutes(),
              base.getUTCSeconds()
            )
          );
        }
      }
    }
  } else if (parsed.freq === 'WEEKLY' && parsed.byDay.length > 0) {
    const days = parsed.byDay.map(d => BYDAY_INDEX[d]).filter(d => d !== undefined);
    // Walk the week containing the first occurrence, stepping `interval` weeks.
    const weekStart = baseStart - base.getUTCDay() * DAY_MS;
    for (let week = 0; week < MAX_OCCURRENCES; week++) {
      const weekBase = weekStart + week * interval * 7 * DAY_MS;
      if (weekBase > steppingEnd) break;
      for (const day of days) push(weekBase + day * DAY_MS);
    }
  } else {
    for (let i = 0; i < MAX_OCCURRENCES; i++) {
      let startMs: number;
      switch (parsed.freq) {
        case 'DAILY':
          startMs = baseStart + i * interval * DAY_MS;
          break;
        case 'WEEKLY':
          startMs = baseStart + i * interval * 7 * DAY_MS;
          break;
        case 'MONTHLY':
          startMs = Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth() + i * interval,
            base.getUTCDate(),
            base.getUTCHours(),
            base.getUTCMinutes(),
            base.getUTCSeconds()
          );
          break;
        case 'YEARLY':
          startMs = Date.UTC(
            base.getUTCFullYear() + i * interval,
            base.getUTCMonth(),
            base.getUTCDate(),
            base.getUTCHours(),
            base.getUTCMinutes(),
            base.getUTCSeconds()
          );
          break;
        default:
          startMs = baseStart;
      }
      // Date.UTC rolls an out-of-range day into the next month/year (e.g. Jan 31 + 1
      // month -> early March) instead of skipping it. Per RFC 5545, such instances
      // must be dropped rather than shifted, so skip any date whose day-of-month
      // doesn't match the series' anchor day.
      if (
        (parsed.freq === 'MONTHLY' || parsed.freq === 'YEARLY') &&
        new Date(startMs).getUTCDate() !== base.getUTCDate()
      ) {
        continue;
      }
      if (startMs > steppingEnd) break;
      push(startMs);
    }
  }

  return starts.sort((a, b) => a - b).map(startMs => ({ startMs, endMs: startMs + duration }));
}

export type BucketedOccurrences = {
  live: Occurrence | null;
  upcoming: Occurrence[];
  past: Occurrence[];
};

/**
 * Bucket occurrences relative to `now`: the live one, future, and recent past.
 *
 * The live window runs from the scheduled start to {@link LIVE_WINDOW_AFTER_MS} past the
 * scheduled end — asymmetric on purpose, and the asymmetry is the point:
 *
 * - **No pre-start grace.** `isOccurrenceLive` admits people 15 minutes early, but a call
 *   that has not started is not live and must not claim to be. Early arrivals are still
 *   offered the join screen; they just read as upcoming, which is what they are.
 * - **Post-end grace, matching the join window.** This used to end at `endMs`, on the
 *   reasoning that the badge should reflect the schedule rather than joinability. That
 *   reasoning produced a real failure: every discovery surface buckets through this
 *   function, so for the 25 minutes a call remains joinable past its scheduled end — while
 *   people are still in it — the rail, the Community tab and the Explore digest all filed it
 *   under past and advertised the *next* occurrence instead. On a weekly series that is next
 *   week. Anyone arriving late to a meeting that ran over could not find the meeting that was
 *   happening. A call still in progress is live; the schedule is what it was planned to be.
 *
 * `past` is the complement, so an occurrence is never both — it leaves the live bucket only
 * once it can no longer be joined.
 */
export function bucketOccurrences(occurrences: Occurrence[], now = Date.now()): BucketedOccurrences {
  const liveUntil = (o: Occurrence) => o.endMs + LIVE_WINDOW_AFTER_MS;
  const live = occurrences.find(o => now >= o.startMs && now <= liveUntil(o)) ?? null;
  const upcoming = occurrences.filter(o => o.startMs > now && o !== live).sort((a, b) => a.startMs - b.startMs);
  const past = occurrences.filter(o => liveUntil(o) < now && o !== live).sort((a, b) => b.startMs - a.startMs);
  return { live, upcoming, past };
}

/**
 * The occurrence a given `occurrenceStart` refers to, or null.
 *
 * Anything acting on the occurrence a user actually joined has to resolve it from the
 * `occurrenceStart` the server minted their token for, rather than recomputing "what is
 * live now" — the two disagree for a page that has been open across a boundary, and
 * acting on the wrong occurrence is how a forced end-of-call cutoff lands in the past.
 *
 * Matched within {@link OCCURRENCE_MATCH_TOLERANCE_MS}: the server's instant need not be
 * byte-identical to the locally expanded one. Expansion is centred on the target rather
 * than on `now`, so a start far outside the current window still resolves.
 */
export function findOccurrenceByStart(schedule: string, occurrenceStart: number): Occurrence | null {
  if (!schedule) return null;
  return (
    getOccurrences(schedule, occurrenceStart).find(
      occurrence => Math.abs(occurrence.startMs - occurrenceStart) <= OCCURRENCE_MATCH_TOLERANCE_MS
    ) ?? null
  );
}
