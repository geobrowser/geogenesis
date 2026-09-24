/**
 * Another person's availability, as the view that draws it needs it (GEO-2938).
 *
 * The one place `/matchmaking/schedule-overlaps` becomes a view model. Nothing downstream parses
 * the wire shape, and nothing downstream sees a UTC instant: absolute instants are what make two
 * people's calendars comparable, and they are also the one thing a grid must never render.
 *
 * Reads `their_slots`, their whole week with each slot flagged, rather than `slots`, which is the
 * intersection kept for surfaces wanting a few suggested times. That is what lets the grid show
 * their availability and style it by the viewer's, instead of filtering by it.
 */
import type { ScheduleOverlapResponse } from '~/core/debates/api';

import { SLOT_MINUTES, addDays, formatTime, isoDate } from './blocks';

/** How many days of columns the view draws. Fixed — there is no range selector. */
export const PEER_SCHEDULE_DAYS = 7;

/**
 * A ceiling on the chips one wire slot may expand into, so a malformed or absurd range cannot
 * lock the render loop up. A day of back-to-back 30-minute slots is 48.
 */
const MAX_CHIPS_PER_SLOT = 48;

export type PeerSlot = {
  /** Absolute UTC instant, exactly as the wire gave it. */
  start: string;
  end: string;
  /** Whether the viewer is free then too — the whole of the solid/dashed distinction. */
  viewerIsFree: boolean;
};

export type PeerSchedule = {
  userId: string;
  /** IANA zones. Both are shown, because a time that reads fine to one person can be their 3am. */
  viewerTimezone: string;
  peerTimezone: string;
  viewerHasSchedule: boolean;
  peerHasSchedule: boolean;
  /** False on a deployment predating geo-chat#134, which cannot send their week at all. */
  theirWeekKnown: boolean;
  slots: PeerSlot[];
};

/** One 30-minute chip, resolved into both people's wall clocks. */
export type PeerDaySlot = {
  /** Absolute instant, kept so a later scheduling half has something unambiguous to send. */
  start: string;
  /**
   * `null` before the viewer's own window opens: the server resolves their schedule over the same
   * UTC-dated range, so `viewer_free` is false there whatever their calendar says.
   */
  viewerIsFree: boolean | null;
  /** Minutes from midnight in the viewer's zone — the chip's sort order. */
  minutes: number;
  /** `9:30am`, in the viewer's zone. */
  label: string;
  /** The same instant in theirs. */
  peerLabel: string;
  /** Their wall clock minus the viewer's, at this instant. Signed, and DST-correct. */
  offsetMinutes: number;
};

export type PeerDay = {
  /** `2026-09-21`, in the viewer's zone. */
  date: string;
  /** `Mon`. */
  weekdayLabel: string;
  /** `Sep 21`. */
  dayLabel: string;
  /** The viewer's own date, which is not drawn at all when the server's window cannot reach it. */
  isToday: boolean;
  slots: PeerDaySlot[];
};

/** Wire to view model. */
export function toPeerSchedule(response: ScheduleOverlapResponse): PeerSchedule {
  return {
    userId: response.with,
    viewerTimezone: response.viewer_timezone,
    peerTimezone: response.with_timezone,
    // `both_have_schedules` was the honest conjunction before geo-chat#134 replaced it.
    viewerHasSchedule: response.viewer_has_schedule ?? response.both_have_schedules,
    // Their zone is empty exactly when they have no saved schedule, which is the one signal
    // separating "set nothing" from "nothing free this window".
    peerHasSchedule: Boolean(response.with_timezone),
    theirWeekKnown: response.their_slots !== undefined,
    slots: (response.their_slots ?? []).map(slot => ({
      start: slot.start,
      end: slot.end,
      viewerIsFree: slot.viewer_free,
    })),
  };
}

/**
 * The seven day columns, with every slot bucketed into the one it falls in *for the viewer*.
 *
 * Bucketing by the viewer's zone rather than the peer's is what makes the grid readable: a slot
 * at their 9am Tuesday belongs in whichever of the viewer's days they will actually be sitting
 * in. Days the peer offers nothing in are still returned, empty, so the grid keeps its shape.
 *
 * @param now injectable so tests can pin the week without pinning the clock.
 */
export function peerScheduleDays(schedule: PeerSchedule, now: Date = new Date()): PeerDay[] {
  const viewerZone = usableZone(schedule.viewerTimezone);
  const peerZone = usableZone(schedule.peerTimezone);

  const today = zonedParts(now, viewerZone).date;
  // Their window opens at their midnight on the UTC date; the viewer's opens at theirs. A peer to
  // the east opens first, and nothing in that lead can be annotated.
  const viewerWindowOpens = schedule.viewerHasSchedule ? windowStart(now, viewerZone).getTime() : -Infinity;

  const days = dayColumns(now, viewerZone, peerZone).map((date): PeerDay => ({
    date,
    ...dayLabels(date),
    isToday: date === today,
    slots: [],
  }));
  const byDate = new Map(days.map(day => [day.date, day]));

  for (const slot of schedule.slots) {
    for (const instant of chipStarts(slot)) {
      const viewer = zonedParts(instant, viewerZone);
      const day = byDate.get(viewer.date);
      // Outside the drawn week. The server bounds this with `days`, but it counts from its own
      // clock in its own zone, so the edges are its to disagree with rather than ours to force.
      if (!day) continue;

      const peer = zonedParts(instant, peerZone);
      day.slots.push({
        start: instant.toISOString(),
        viewerIsFree: instant.getTime() < viewerWindowOpens ? null : slot.viewerIsFree,
        minutes: viewer.minutes,
        label: formatTime(viewer.minutes),
        peerLabel: formatTime(peer.minutes),
        offsetMinutes: wallMinutes(peer) - wallMinutes(viewer),
      });
    }
  }

  for (const day of days) {
    day.slots.sort((a, b) => a.minutes - b.minutes);
  }
  return days;
}

/**
 * A wire slot as the chips it offers.
 *
 * Stepping by {@link SLOT_MINUTES} rather than trusting one entry to be one chip. The endpoint
 * sends slot-sized entries today, so this is a no-op; it earns its keep if that ever changes.
 *
 * A trailing part-slot still counts — a debate runs six to eight minutes, so the last 30 minutes
 * of a block is as usable as the first. There is deliberately no "unbookable" state here.
 */
function chipStarts(slot: PeerSlot): Date[] {
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const step = SLOT_MINUTES * 60_000;
  const starts: Date[] = [];
  for (let instant = start; instant < end && starts.length < MAX_CHIPS_PER_SLOT; instant += step) {
    starts.push(new Date(instant));
  }
  return starts;
}

/** Seven columns from the viewer's today, or the first day the server reaches: their slots resolve
 * in *their* zone from the UTC date, so the earliest instant is their midnight on it. */
function dayColumns(now: Date, viewerZone: string | undefined, peerZone: string | undefined): string[] {
  const today = zonedParts(now, viewerZone).date;
  const reachable = zonedParts(windowStart(now, peerZone), viewerZone).date;
  const [year, month, day] = (today > reachable ? today : reachable).split('-').map(Number);
  // Midday, so this first date cannot sit on an hour a DST jump skipped.
  const first = new Date(year, month - 1, day, 12);
  return Array.from({ length: PEER_SCHEDULE_DAYS }, (_, offset) => isoDate(addDays(first, offset)));
}

/** Midnight in `zone` on the UTC date, where the server's walk begins. A DST jump over midnight
 * leaves neither candidate on it, and the day then opens at the end of the gap. */
function windowStart(now: Date, zone: string | undefined): Date {
  const [year, month, day] = zonedParts(now, 'UTC').date.split('-').map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day);
  const first = midnightUtc - zoneOffsetMinutes(new Date(midnightUtc), zone) * 60_000;
  const second = midnightUtc - zoneOffsetMinutes(new Date(first), zone) * 60_000;

  const isMidnight = (instant: number) => wallMinutes(zonedParts(new Date(instant), zone)) === midnightUtc / 60_000;
  const real = [first, second].filter(isMidnight);
  return new Date(real.length > 0 ? Math.min(...real) : Math.max(first, second));
}

function zoneOffsetMinutes(instant: Date, zone: string | undefined): number {
  return wallMinutes(zonedParts(instant, zone)) - wallMinutes(zonedParts(instant, 'UTC'));
}

function dayLabels(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const local = new Date(year, month - 1, day, 12);
  return {
    weekdayLabel: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(local),
    dayLabel: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(local),
  };
}

type ZonedParts = { date: string; minutes: number };

/**
 * An instant as a wall clock in `zone`.
 *
 * Via `Intl` per instant, never a stored offset: an offset captured on one side of a DST boundary
 * is wrong on the other, and a schedule spanning a week crosses one twice a year.
 */
function zonedParts(instant: Date, zone: string | undefined): ZonedParts {
  const parts = formatterFor(zone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '0';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

/** Wall clock as a single comparable number, so two zones' clocks can simply be subtracted. */
function wallMinutes({ date, minutes }: ZonedParts): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 60_000 + minutes;
}

/**
 * `undefined` for anything `Intl` will not take — an empty zone, or the `local` that
 * `localTimezone` yields where the browser will not say. A formatter built without a
 * `timeZone` uses the browser's own, which is the honest fallback and never throws.
 */
function usableZone(zone: string | undefined): string | undefined {
  if (!zone || zone === 'local') return undefined;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return undefined;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Cached: building one per slot per render is the expensive half of `Intl`. */
function formatterFor(zone: string | undefined): Intl.DateTimeFormat {
  const key = zone ?? '';
  const cached = formatters.get(key);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    ...(zone ? { timeZone: zone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    // `h23` rather than `hour12: false`, which renders midnight as hour 24 in some engines.
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  formatters.set(key, formatter);
  return formatter;
}

/** `+5:30 hrs`, or `same time as you` at zero. For the header, beside both zone names. */
export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'same time as you';
  const sign = minutes > 0 ? '+' : '−';
  const whole = Math.abs(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''} hr${hours === 1 && !rest ? '' : 's'}`;
}

/**
 * When a chip is worth carrying their local time as well.
 *
 * Three hours is where "that works for me" stops implying anything about them: below it both
 * people are inside the same rough part of the day, above it a comfortable slot is somebody's
 * night, which is the usual reason a proposed time comes back refused.
 */
export const LARGE_OFFSET_MINUTES = 3 * 60;
