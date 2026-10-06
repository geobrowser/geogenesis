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
import type { ScheduleOverlapResponse, ScheduleOverlapSlot } from '~/core/debates/api';

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

/** One 30-minute chip, labelled in the viewer's wall clock. */
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
    for (const instant of slotStarts(slot)) {
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
 * A wire slot, or a merged window of them, as the chips it offers. The People tab reads its
 * offline rows' times through this too (GEO-3154), so a chip there is always one this grid draws.
 *
 * Stepping by {@link SLOT_MINUTES} rather than trusting one entry to be one chip. The week's
 * endpoint sends slot-sized entries, where this is a no-op; the free-people list sends merged
 * windows (geo-chat#204), where it is what splits them back into bookable times.
 *
 * A trailing part-slot still counts — a debate runs six to eight minutes, so the last 30 minutes
 * of a block is as usable as the first. There is deliberately no "unbookable" state here.
 *
 * `after` skips to the first start later than it, on the window's own grid. Filtering afterwards
 * would not do: a window that began more than a day ago fills the ceiling with past starts first.
 */
export function slotStarts(slot: ScheduleOverlapSlot, { after }: { after?: number } = {}): Date[] {
  const start = Date.parse(slot.start);
  const end = Date.parse(slot.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const step = SLOT_MINUTES * 60_000;
  const first = after === undefined || after < start ? start : start + (Math.floor((after - start) / step) + 1) * step;
  const starts: Date[] = [];
  for (let instant = first; instant < end && starts.length < MAX_CHIPS_PER_SLOT; instant += step) {
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

/** Midnight in `zone` on the UTC date, where the server's walk begins. */
function windowStart(now: Date, zone: string | undefined): Date {
  const [year, month, day] = zonedParts(now, 'UTC').date.split('-').map(Number);
  return wallClockInstant(Date.UTC(year, month - 1, day), zone);
}

/**
 * The instant a wall clock in `zone` names, with the wall clock given as if it were UTC.
 *
 * Tried with the zone's offset a day either side, since no zone changes offset twice in two days.
 * A wall clock the clocks go back over has two instants, and resolves to the earlier; one a DST
 * jump skipped has none, and moves forward by the jump — both what `new Date(local)` does.
 */
function wallClockInstant(wallAsUtc: number, zone: string | undefined): Date {
  const candidates = [-DAY_MS, DAY_MS].map(
    shift => wallAsUtc - zoneOffsetMinutes(new Date(wallAsUtc + shift), zone) * 60_000
  );

  const isWall = (instant: number) => wallMinutes(zonedParts(new Date(instant), zone)) === wallAsUtc / 60_000;
  const real = candidates.filter(isWall);
  return new Date(real.length > 0 ? Math.min(...real) : Math.max(...candidates));
}

const DAY_MS = 86_400_000;

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

/**
 * An instant in full, in the same zone the grid draws the viewer's week in — so a footer naming the
 * picked time can never disagree with the chip it came from, whatever zone the browser is in.
 */
export function formatViewerInstant(iso: string, viewerTimezone: string | undefined): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const zone = usableZone(viewerTimezone);
  return at.toLocaleString(undefined, zone ? { timeZone: zone } : undefined);
}

/**
 * A `datetime-local` value for an instant, as the wall clock in the grid's zone — the one a typed
 * time is read back in by `viewerInputInstant`.
 */
export function viewerInputValue(at: number, viewerTimezone: string | undefined): string {
  const { date, minutes } = zonedParts(new Date(at), usableZone(viewerTimezone));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * A `datetime-local` value read as a wall clock in the grid's zone rather than the browser's, so a
 * typed time means what the chips and the confirmation say it means. `null` for anything else.
 */
export function viewerInputInstant(value: string, viewerTimezone: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return wallClockInstant(Date.UTC(year, month - 1, day, hour, minute), usableZone(viewerTimezone));
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
