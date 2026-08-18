/**
 * Expand an iCalendar schedule string into concrete occurrences and bucket them
 * into live / upcoming / past. Mirrors curator's `getNextOccurrences` /
 * `isOccurrenceLive`, reusing geogenesis's existing schedule parser.
 */
import { localToUtcMs, parseSchedule } from '~/core/utils/schedule';

import { Occurrence } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

const BYDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// How far back/forward we expand recurring series for the listing, plus a hard
// iteration cap so a malformed RRULE can never loop unbounded.
const PAST_WINDOW_MS = 60 * DAY_MS;
const FUTURE_WINDOW_MS = 180 * DAY_MS;
const MAX_OCCURRENCES = 500;

function toMs(dateStr: string, time: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h || 0, min || 0);
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

/** Expand a schedule into occurrences within [now - 60d, now + 180d]. */
export function getOccurrences(schedule: string, now = Date.now()): Occurrence[] {
  const parsed = parseSchedule(schedule);
  if (!parsed.startDate) return [];

  // All stepping arithmetic below (weekBase/startMs) stays in "naive" ms — wall-clock
  // calendar math (add N days/weeks/months) is timezone-agnostic by nature. Only the
  // final occurrence instants get converted to true UTC via `toTrueMs`, once per
  // occurrence, so each one picks up the correct offset for its own date.
  const baseStart = toMs(parsed.startDate, parsed.startTime);
  const duration = parsed.endTime
    ? Math.max(toMs(parsed.startDate, parsed.endTime) - baseStart, DEFAULT_DURATION_MS)
    : DEFAULT_DURATION_MS;

  const windowStart = now - PAST_WINDOW_MS;
  const windowEnd = now + FUTURE_WINDOW_MS;
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

  if (parsed.freq === 'WEEKLY' && parsed.byDay.length > 0) {
    const days = parsed.byDay.map(d => BYDAY_INDEX[d]).filter(d => d !== undefined);
    // Walk the week containing the first occurrence, stepping `interval` weeks.
    const weekStart = baseStart - base.getUTCDay() * DAY_MS;
    for (let week = 0; week < MAX_OCCURRENCES; week++) {
      const weekBase = weekStart + week * interval * 7 * DAY_MS;
      if (weekBase > windowEnd) break;
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
            base.getUTCMinutes()
          );
          break;
        case 'YEARLY':
          startMs = Date.UTC(
            base.getUTCFullYear() + i * interval,
            base.getUTCMonth(),
            base.getUTCDate(),
            base.getUTCHours(),
            base.getUTCMinutes()
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
      if (startMs > windowEnd) break;
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
 * "Live" here is the scheduled window only (no before/after grace) — it drives the
 * "LIVE" badge on the listing, which should reflect the schedule, not joinability.
 * `isOccurrenceLive` (with its grace window) is a separate, deliberately more
 * lenient check used only to decide whether the join screen is offered.
 */
export function bucketOccurrences(occurrences: Occurrence[], now = Date.now()): BucketedOccurrences {
  const live = occurrences.find(o => now >= o.startMs && now <= o.endMs) ?? null;
  const upcoming = occurrences.filter(o => o.startMs > now && o !== live).sort((a, b) => a.startMs - b.startMs);
  const past = occurrences.filter(o => o.endMs < now && o !== live).sort((a, b) => b.startMs - a.startMs);
  return { live, upcoming, past };
}
