import { addDays, isoDate } from '~/core/availability/blocks';
import { dayLabels, zonedClock, zonedWallClockInstant } from '~/core/availability/peer-schedule';
import { isValidTimeZone, tzAbbreviation } from '~/core/utils/schedule';
import { getViewerTimeZone } from '~/core/utils/utils';

import { timeIn, zoneCity } from './admin-debate-calendar-model';

/**
 * The zone New match draws every time in (GEO-3231). An admin who sends personal invites in GMT
 * picks it once and keeps it; the debaters' invites stay in their own zones whatever is picked,
 * since the dialog only ever sends an instant.
 */
export const GMT = 'UTC';

/**
 * Per browser rather than per account, like `watched-debates`: a display preference nothing
 * server-side needs. Plain `localStorage` behind try/catch, never a module-level jotai storage atom,
 * which would touch storage on import and break every suite importing the dialog under jsdom.
 */
const STORAGE_KEY = 'geogenesis.debates.admin-match-zone.v1';

/** The zone picked last time, or the browser's own the first time and for anything unreadable. */
export function readAdminMatchZone(): string {
  if (typeof window === 'undefined') return getViewerTimeZone();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && isValidTimeZone(saved) ? saved : getViewerTimeZone();
  } catch {
    return getViewerTimeZone();
  }
}

export function saveAdminMatchZone(zone: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, zone);
  } catch {
    // A private window or blocked storage: the pick holds for this opening and is forgotten after.
  }
}

/** `GMT`, or `Madrid (GMT+2)`: what the zone is called beside every time drawn in it. */
export function zoneLabel(zone: string, at: number = Date.now()): string {
  if (zone === GMT || zone === 'Etc/UTC' || zone === 'GMT') return 'GMT';
  return `${zoneCity(zone)} (${tzAbbreviation(zone, at)})`;
}

/** `2026-10-06`: the date `at` falls on in `zone`. */
export function dateIn(at: number, zone: string): string {
  return zonedClock(at, zone).date;
}

/** Minutes past midnight `at` reads as in `zone`. */
export function minutesIn(at: number, zone: string): number {
  return zonedClock(at, zone).minutes;
}

/** `count` dates in `zone`, today first: the days a match can be booked on, as that zone counts them. */
export function zoneDays(now: number, zone: string, count: number): string[] {
  const [year, month, day] = dateIn(now, zone).split('-').map(Number);
  // Midday, so no date in the run can sit on an hour a DST jump skipped.
  const first = new Date(year, month - 1, day, 12);
  return Array.from({ length: count }, (_, offset) => isoDate(addDays(first, offset)));
}

/**
 * `minutes` past midnight on `date` by the wall clock in `zone`. Resolved per date rather than by
 * adding milliseconds, which lands an hour off on a day the clocks change.
 */
export function instantAt(date: string, minutes: number, zone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return zonedWallClockInstant(Date.UTC(year, month - 1, day, 0, minutes), zone).getTime();
}

/** The peer week's `Tue` and `Oct 6` for a date, plus the two forms New match also needs. */
export function dateLabels(date: string) {
  const { weekdayLabel, dayLabel } = dayLabels(date);
  const [year, month, day] = date.split('-').map(Number);
  return {
    weekday: weekdayLabel,
    monthDay: dayLabel,
    full: `${weekdayLabel}, ${dayLabel}`,
    /** `Wednesday, October 7`, for names read aloud. */
    long: new Date(year, month - 1, day, 12).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  };
}

/** `3:00 PM` for minutes past midnight, as a wall clock: read in GMT, so no DST hour repeats or vanishes. */
export function wallTime(minutes: number): string {
  return timeIn(Date.UTC(2000, 0, 1, 0, minutes), GMT);
}
