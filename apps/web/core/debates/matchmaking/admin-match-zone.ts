import { SLOT_MINUTES, addDays, isoDate } from '~/core/availability/blocks';
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

/**
 * `GMT`, or `Madrid`: the zone alone, for whatever spans the fortnight. Two weeks can cross a clock
 * change, so no single offset is true of all of it.
 */
export function zoneName(zone: string): string {
  return zone === GMT || zone === 'Etc/UTC' || zone === 'GMT' ? 'GMT' : zoneCity(zone);
}

/** `GMT`, or `Madrid (GMT+2)`: the zone as it is at `at`, beside a time drawn in it. */
export function zoneLabel(zone: string, at: number): string {
  const name = zoneName(zone);
  return name === 'GMT' ? name : `${name} (${tzAbbreviation(zone, at)})`;
}

/**
 * `3:00 PM – 3:30 PM GMT`: a span in `zone`, named once. Where the clocks change inside it, each
 * end gets its own offset: `1:30 AM London (GMT+1) – 1:00 AM London (GMT)`.
 */
export function spanIn(start: number, end: number, zone: string): string {
  const [from, to] = [zoneLabel(zone, start), zoneLabel(zone, end)];
  return from === to
    ? `${timeIn(start, zone)} – ${timeIn(end, zone)} ${from}`
    : `${timeIn(start, zone)} ${from} – ${timeIn(end, zone)} ${to}`;
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

/**
 * Every half-hour start from midnight on `date` in `zone` to the next midnight, as instants: 48 on
 * most days, 50 the day the clocks go back (the repeated hour comes twice) and 46 the day they go
 * forward. Stepping wall clocks instead would draw the repeated hour once and the skipped one as
 * copies of the hour after it.
 */
export function halfHoursOf(date: string, zone: string): number[] {
  const [year, month, day] = date.split('-').map(Number);
  const next = isoDate(addDays(new Date(year, month - 1, day, 12), 1));
  const end = instantAt(next, 0, zone);
  const starts: number[] = [];
  for (let start = instantAt(date, 0, zone); start < end; start += SLOT_MINUTES * 60_000) starts.push(start);
  return starts;
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

/** Minutes past midnight as a time input's `HH:MM` value. */
export function clockValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A time input's `HH:MM` value as minutes past midnight: `null` while it's cleared or half typed. */
export function minutesOfClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}
