import { zonedClock, zonedWallClockInstant } from '~/core/availability/peer-schedule';

import { zoneCity } from './admin-debate-calendar-model';

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

/** The browser's own zone, or GMT where the browser will not say. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || GMT;
  } catch {
    return GMT;
  }
}

function isUsableZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The zone picked last time, or the browser's own the first time and for anything unreadable. */
export function readAdminMatchZone(): string {
  if (typeof window === 'undefined') return browserZone();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && isUsableZone(saved) ? saved : browserZone();
  } catch {
    return browserZone();
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
  let offset = '';
  try {
    offset =
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
        .formatToParts(at)
        .find(part => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    // An engine without `shortOffset` still gets the city.
  }
  return offset ? `${zoneCity(zone)} (${offset})` : zoneCity(zone);
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
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10)
  );
}

/**
 * `minutes` past midnight on `date` by the wall clock in `zone`. Resolved per date rather than by
 * adding milliseconds, which lands an hour off on a day the clocks change.
 */
export function instantAt(date: string, minutes: number, zone: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return zonedWallClockInstant(Date.UTC(year, month - 1, day, 0, minutes), zone).getTime();
}

/** `Tue` and `Oct 6` for a date, the same in every zone: it is already a calendar date. */
export function dateLabels(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  return {
    weekday: noon.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    longWeekday: noon.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    monthDay: noon.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    full: noon.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
  };
}

/** `3:00 PM` for minutes past midnight, as a wall clock: no zone, so no DST hour can repeat or vanish. */
export function wallTime(minutes: number): string {
  return new Date(Date.UTC(2000, 0, 1, 0, minutes)).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}
