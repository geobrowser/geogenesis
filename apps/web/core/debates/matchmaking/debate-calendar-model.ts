/**
 * The calendar's week (GEO-3152), as plain data: who is free in which hour of which day, in the
 * viewer's own zone.
 *
 * The browser's zone rather than the one the viewer's schedule was saved in. The page is read here
 * and now, and "Thu 18:00" has to mean what the viewer's clock will say on Thursday. The zone's name
 * is shown beside the week, so the two cannot be confused.
 *
 * Everything here works on instants (milliseconds). Only the bucketing reads a wall clock, through
 * `Date`'s local getters, which is what keeps a week that crosses a DST change honest: the Sunday the
 * clocks go back has 25 hours, and the hour that repeats still lands in one row.
 */
import {
  type AvailabilityBlock,
  SLOT_MINUTES,
  addDays,
  effectiveAvailability,
  isoDate,
  mondayOf,
  weekDates,
} from '~/core/availability/blocks';
import { slotStarts, zonedWallClockInstant } from '~/core/availability/peer-schedule';
import type { SchedulablePeopleResponse, ScheduledDebateRequest } from '~/core/debates/api';
import { opponentOf } from '~/core/debates/rooms/room-opponent';
import { normId } from '~/core/utils/norm-id';

export const SLOT_MS = SLOT_MINUTES * 60_000;
export const DAYS_IN_WEEK = 7;
export const HOURS_IN_DAY = 24;

/** This week and next. The list's window is a fortnight, and navigation stops at its edge. */
export const CALENDAR_WEEKS = 2;

/**
 * A ceiling on the slots one wire window may expand into, so a malformed range cannot lock the
 * render loop up. A fortnight of back-to-back half-hours is 672, but a local fortnight the clocks go
 * back in is an hour longer, so the ceiling carries a day of slack; the grid drops anything past
 * the drawn weeks anyway.
 */
const MAX_SLOTS_PER_WINDOW = (CALENDAR_WEEKS * DAYS_IN_WEEK + 1) * 48;

/** One bookable half-hour of someone's. */
export type FreeSlot = {
  start: number;
  /** Whether the viewer's own schedule has them free then too. */
  viewerFree: boolean;
};

/**
 * Each listed person's bookable half-hours still ahead, soonest first, keyed by `normId(user_id)`,
 * read from `their_windows`: their whole free time, whether or not the viewer shares it (geo-chat#204).
 */
export function freeSlotsByUser(response: SchedulablePeopleResponse, now: number): Map<string, FreeSlot[]> {
  const byUser = new Map<string, FreeSlot[]>();

  for (const person of response.people) {
    const slots: FreeSlot[] = (person.their_windows ?? []).flatMap(window =>
      slotStarts(window, { after: now, max: MAX_SLOTS_PER_WINDOW }).map(start => ({
        start: start.getTime(),
        viewerFree: window.viewer_free,
      }))
    );
    slots.sort((left, right) => left.start - right.start);
    if (slots.length > 0) byUser.set(normId(person.user.user_id), slots);
  }

  return byUser;
}

/**
 * Local midnight on the Sunday `weekOffset` weeks from the one `now` falls in. The grid reads Sunday
 * to Saturday, like a wall calendar; saved schedules are still Monday-first (`mondayOf`).
 */
export function weekStart(now: Date, weekOffset: number): Date {
  return addDays(now, weekOffset * DAYS_IN_WEEK - now.getDay());
}

/** The seven local midnights of a week, plus the eighth, which closes it. */
export function weekDays(start: Date): Date[] {
  return Array.from(
    { length: DAYS_IN_WEEK + 1 },
    (_, day) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + day)
  );
}

/** Where an instant falls in a week, or null outside it. */
export function cellOf(at: number, days: Date[]): { day: number; hour: number } | null {
  if (at < days[0].getTime() || at >= days[DAYS_IN_WEEK].getTime()) return null;
  for (let day = 0; day < DAYS_IN_WEEK; day++) {
    if (at < days[day + 1].getTime()) return { day, hour: new Date(at).getHours() };
  }
  return null;
}

export function cellKey(day: number, hour: number) {
  return `${day}:${hour}`;
}

/** Everyone free in one hour of one day, each with the half-hours they offer in it. */
export type CellPerson = { userKey: string; slots: FreeSlot[] };

/**
 * Who is free in each hour of a week. A face means free for some of that hour: the half-hours
 * themselves are what the card and the hour's list offer as chips.
 *
 * `order` ranks people within an hour, and is applied here so every cell agrees with it.
 */
export function weekCells(
  slotsByUser: ReadonlyMap<string, FreeSlot[]>,
  days: Date[],
  {
    include,
    order,
  }: {
    include: (userKey: string) => boolean;
    order: (left: CellPerson, right: CellPerson) => number;
  }
): Map<string, CellPerson[]> {
  const cells = new Map<string, Map<string, FreeSlot[]>>();

  for (const [userKey, slots] of slotsByUser) {
    if (!include(userKey)) continue;
    for (const slot of slots) {
      const cell = cellOf(slot.start, days);
      if (!cell) continue;
      const key = cellKey(cell.day, cell.hour);
      const people = cells.get(key) ?? new Map<string, FreeSlot[]>();
      people.set(userKey, [...(people.get(userKey) ?? []), slot]);
      cells.set(key, people);
    }
  }

  const ordered = new Map<string, CellPerson[]>();
  for (const [key, people] of cells) {
    ordered.set(key, [...people].map(([userKey, slots]) => ({ userKey, slots })).sort(order));
  }
  return ordered;
}

/**
 * The hours the viewer's own schedule offers, as slot instants, across the drawn fortnight.
 *
 * Resolved here from their saved blocks, in the zone they were saved in, rather than read off other
 * people's windows: an hour the viewer is free in but nobody else is still has to be shaded, and
 * the green chips have to agree with the shading exactly. Their booked debates are not taken
 * out; those are drawn over the hour anyway.
 */
export function viewerFreeSlots(
  blocks: AvailabilityBlock[] | undefined,
  scheduleZone: string | undefined,
  now: Date
): Set<number> {
  const free = new Set<number>();
  if (!blocks || blocks.length === 0) return free;

  // A week either side of the drawn two: the viewer's zone and the browser's can disagree about
  // which date it is, and a slot near midnight belongs to whichever week it lands in here. Monday
  // weeks, not the grid's Sunday ones: a recurring block's `weekday` counts from Monday.
  const monday = mondayOf(now);
  for (let offset = -1; offset <= CALENDAR_WEEKS; offset++) {
    const dates = weekDates(addDays(monday, offset * DAYS_IN_WEEK)).map(isoDate);
    for (const day of effectiveAvailability(blocks, dates)) {
      const [year, month, date] = day.date.split('-').map(Number);
      for (const [start, end] of day.ranges) {
        for (let minute = start; minute + SLOT_MINUTES <= end; minute += SLOT_MINUTES) {
          free.add(zonedWallClockInstant(Date.UTC(year, month - 1, date, 0, minute), scheduleZone).getTime());
        }
      }
    }
  }
  return free;
}

/**
 * The cells of a week the viewer is free in, bucketed exactly as everyone else's slots are.
 *
 * Bucketing the instants, rather than rebuilding each row's wall-clock hour and looking that up:
 * the day the clocks go forward has no 2am, a 2am built from the calendar comes back as 3am, and
 * the skipped row would be shaded with 3am's time.
 */
export function viewerFreeCellKeys(free: ReadonlySet<number>, days: Date[]): Set<string> {
  const keys = new Set<string>();
  for (const at of free) {
    const cell = cellOf(at, days);
    if (cell) keys.add(cellKey(cell.day, cell.hour));
  }
  return keys;
}

/** The instant an hour of a drawn day starts. */
export function hourStart(days: Date[], day: number, hour: number): number {
  const date = days[day];
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour).getTime();
}

/** How far through its hour an instant is, from 0 at the top of the hour towards 1. */
export function hourProgress(at: number): number {
  return new Date(at).getMinutes() / 60;
}

/** One of the viewer's own debates, as the grid draws it. */
export type OwnDebate = {
  requestId: string;
  start: number;
  end: number;
  /** `booked` once everyone accepted; `requested` while the viewer waits; `asked` while they're asked. */
  state: 'booked' | 'requested' | 'asked';
  /** The other side, whose name labels the block. */
  opponentUserId: string | null;
};

/**
 * The viewer's own scheduled debates that still hold a time: accepted, or pending either way.
 *
 * `extra` is requests this page has just sent, which the list read has not returned yet. They are
 * kept until it does, so a booking turns into a Requested block at once rather than a poll later.
 */
export function ownDebates(
  requests: ScheduledDebateRequest[] | undefined,
  extra: ScheduledDebateRequest[],
  viewerUserId: string | null
): OwnDebate[] {
  const byId = new Map<string, ScheduledDebateRequest>();
  for (const request of extra) byId.set(request.request_id, request);
  // The server's copy wins: it is the one that knows whether it has since been answered.
  for (const request of requests ?? []) byId.set(request.request_id, request);

  const debates: OwnDebate[] = [];
  for (const request of byId.values()) {
    if (request.status !== 'accepted' && request.status !== 'pending') continue;
    const start = Date.parse(request.scheduled_start_at);
    const end = Date.parse(request.scheduled_end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    debates.push({
      requestId: request.request_id,
      start,
      end,
      state: request.status === 'accepted' ? 'booked' : request.viewer_must_answer ? 'asked' : 'requested',
      opponentUserId: opponentOf(request, viewerUserId),
    });
  }
  return debates.sort((left, right) => left.start - right.start);
}

/** The first hour, from midnight, that anything in the week happens in; null for an empty week. */
export function firstBusyHour(cells: ReadonlyMap<string, unknown>, debates: OwnDebate[], days: Date[]): number | null {
  let first: number | null = null;
  for (const key of cells.keys()) {
    const hour = Number(key.split(':')[1]);
    if (first === null || hour < first) first = hour;
  }
  for (const debate of debates) {
    const cell = cellOf(debate.start, days);
    if (cell && (first === null || cell.hour < first)) first = cell.hour;
  }
  return first;
}

/** A day list's heading: `Thu 8`, or `Today, Thu 8`. */
export function dayListLabel(date: Date, today: Date): string {
  // Composed rather than formatted together: en-US writes the pair as `8 Thu`.
  const label = `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`;
  return date.toDateString() === today.toDateString() ? `Today, ${label}` : label;
}

/** `5 – 11 Oct 2026`, `Oct 5 – 11, 2026`: however the viewer's locale writes a range of days. */
export function weekRangeLabel(days: Date[]): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(
    days[0],
    days[DAYS_IN_WEEK - 1]
  );
}

/** `18:00` or `6:00 PM`, as the viewer's locale writes an hour. */
export function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** `18:00 – 18:30`, in the viewer's locale. */
export function timeRangeLabel(start: number, end: number): string {
  const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${time(start)} – ${time(end)}`;
}

/**
 * The viewer's UTC offset over a week, the way Google Calendar heads its time column: `GMT-07`,
 * `GMT+05:30`. The grid is drawn in the browser's own zone, so this is that zone's offset.
 *
 * Two labels for a week a clock change falls in, start's first, so the column doesn't claim one
 * offset for the days on the far side of the change. Read at noon, clear of any change's own hour.
 */
export function weekOffsetLabels(days: Date[]): string[] {
  const labels: string[] = [];
  for (const day of days) {
    const noon = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
    const label = gmtOffsetLabel(noon);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

export function gmtOffsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  if (minutes === 0) return 'GMT';
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const rest = abs % 60;
  return `GMT${minutes > 0 ? '+' : '-'}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}
