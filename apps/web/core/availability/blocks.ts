/**
 * Availability blocks: the data behind the week calendar a person marks themselves free on
 * (GEO-2936). Ported from the GEO-2936 interaction prototype.
 *
 * Times are minutes from midnight in the viewer's own zone, which is the only zone the grid can
 * honestly draw. The zone travels with the payload so the server can resolve those minutes
 * against a real instant; it is never inferred there.
 *
 * Weekdays are 0 = Monday, matching the column order of the grid. The payload converts to
 * 1 = Monday on the way out, so nothing downstream has to know which end the week starts.
 */

/** The grid runs the whole day: night shifts and other time zones are availability too. */
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;

/**
 * Where the grid is scrolled to when it opens. The whole day is reachable, but most people's is
 * not, and starting at midnight would open on eight empty hours.
 */
export const DAY_INITIAL_HOUR = 7;

/**
 * Snap granularity, and the length of one offerable slot.
 *
 * 15 makes a long block's slot list unscannable; 60 forces false precision on people who are free
 * from half past. One constant because they are the same decision: a block that cannot start at
 * 9:15 should not produce a slot at 9:15 either.
 */
export const SLOT_MINUTES = 30;

export type BlockKind = 'recurring' | 'dated' | 'exception';

type BlockBase = {
  id: string;
  /** Minutes from midnight, inclusive. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
};

/** Every week, on this weekday. */
export type RecurringBlock = BlockBase & { kind: 'recurring'; weekday: number };
/** This date only — an extra window that does not repeat. */
export type DatedBlock = BlockBase & { kind: 'dated'; date: string };
/**
 * This date only — removes time a recurring block would otherwise offer.
 *
 * Without it, "free Tuesdays, but not next Tuesday" can only be said by deleting the recurring
 * block and putting it back, which is the main way availability goes stale and sends invitations
 * nobody can accept.
 */
export type ExceptionBlock = BlockBase & { kind: 'exception'; date: string };

export type AvailabilityBlock = RecurringBlock | DatedBlock | ExceptionBlock;

/** Round to the snap grid. */
export function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

/** Hold a time inside the drawn day. */
export function clampToDay(minutes: number) {
  return Math.max(DAY_START_HOUR * 60, Math.min(DAY_END_HOUR * 60, minutes));
}

/** `9am`, `9:30am`, `12pm` — the grid's own labels. */
export function formatTime(minutes: number) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'pm' : 'am';
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${suffix}`;
}

/** `09:00` — how a time crosses the wire. */
export function formatTime24(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** `2026-09-18` in local terms. `toISOString` would shift the date for anyone west of UTC. */
export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** The Monday on or before `date`, at midnight. */
export function mondayOf(date: Date) {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(midnight, -((midnight.getDay() + 6) % 7));
}

/** The seven dates of the week starting at `monday`. */
export function weekDates(monday: Date) {
  return Array.from({ length: 7 }, (_, day) => addDays(monday, day));
}

/** Which column a block sits in, or null when it belongs to another week. */
export function columnFor(block: AvailabilityBlock, dates: string[]) {
  if (block.kind === 'recurring') return block.weekday;
  const index = dates.indexOf(block.date);
  return index === -1 ? null : index;
}

/** What a block is grouped and merged within: its kind, and the day it applies to. */
function laneOf(block: AvailabilityBlock) {
  return block.kind === 'recurring' ? `recurring|${block.weekday}` : `${block.kind}|${block.date}`;
}

/**
 * Fold overlapping and touching blocks of the same kind and day into one.
 *
 * Dragging a second block over a first should read as one longer window, not two stacked ones —
 * and two adjacent blocks would otherwise emit two payload entries describing one span.
 */
export function mergeBlocks(blocks: AvailabilityBlock[]): AvailabilityBlock[] {
  const lanes = new Map<string, AvailabilityBlock[]>();
  for (const block of blocks) {
    const lane = laneOf(block);
    lanes.set(lane, [...(lanes.get(lane) ?? []), block]);
  }

  const merged: AvailabilityBlock[] = [];
  for (const lane of lanes.values()) {
    let current: AvailabilityBlock | null = null;
    for (const block of [...lane].sort((a, b) => a.start - b.start)) {
      // `<=` rather than `<`: 9–10 followed by 10–11 is one window, not two abutting ones.
      if (current && block.start <= current.end) {
        current.end = Math.max(current.end, block.end);
        continue;
      }
      current = { ...block };
      merged.push(current);
    }
  }
  return merged;
}

export type DayAvailability = {
  /** 0 = Monday. */
  weekday: number;
  date: string;
  /** Disjoint, ascending, exceptions already removed. */
  ranges: [start: number, end: number][];
};

/**
 * What each day of the week actually offers: recurring plus dated, minus exceptions.
 *
 * This is the only place the three kinds are resolved against each other, so the grid, the slot
 * list and anything matching on availability cannot disagree about what a person is offering.
 */
export function effectiveAvailability(blocks: AvailabilityBlock[], dates: string[]): DayAvailability[] {
  return dates.map((date, weekday) => {
    const offered = blocks
      .filter(
        block =>
          (block.kind === 'recurring' && block.weekday === weekday) || (block.kind === 'dated' && block.date === date)
      )
      .map((block): [number, number] => [block.start, block.end]);

    const removed = blocks
      .filter(block => block.kind === 'exception' && block.date === date)
      .map((block): [number, number] => [block.start, block.end]);

    const ranges = mergeRanges(offered).flatMap(range => subtractRanges(range, removed));
    return { weekday, date, ranges: ranges.sort((a, b) => a[0] - b[0]) };
  });
}

function mergeRanges(ranges: [number, number][]) {
  const merged: [number, number][] = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** `range` with every `removals` span cut out of it — one range in, zero, one or two out. */
function subtractRanges(range: [number, number], removals: [number, number][]) {
  let parts: [number, number][] = [range];
  for (const [removeStart, removeEnd] of removals) {
    const next: [number, number][] = [];
    for (const [start, end] of parts) {
      if (removeEnd <= start || removeStart >= end) {
        next.push([start, end]);
        continue;
      }
      if (removeStart > start) next.push([start, removeStart]);
      if (removeEnd < end) next.push([removeEnd, end]);
    }
    parts = next;
  }
  return parts;
}

/**
 * The slot starts a range offers. A 9–10 range is two invitable 30-minute slots, not one hour-long
 * one: the person on the other side picks a slot, not a span.
 */
export function slotsForRange([start, end]: [number, number]) {
  const slots: number[] = [];
  for (let minute = start; minute + SLOT_MINUTES <= end; minute += SLOT_MINUTES) slots.push(minute);
  return slots;
}

/**
 * How far a block is indented so an overlapping one stays readable, in the manner of Google
 * Calendar: each block that starts inside an earlier one steps right, and the depths reset once
 * the column is clear again.
 *
 * Only ever needed across kinds — {@link mergeBlocks} folds overlaps within a kind — so this is
 * what makes an exception visible *over* the recurring block it removes time from, rather than
 * hidden behind it.
 */
export function overlapDepths(blocks: AvailabilityBlock[]): Map<string, number> {
  const depths = new Map<string, number>();
  // Ties broken by the longer block first, so a short block sits on top of the one containing it
  // rather than the other way round.
  const ordered = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const openEnds: number[] = [];

  for (const block of ordered) {
    // Anything that has finished by the time this one starts frees up its lane.
    for (let lane = openEnds.length - 1; lane >= 0; lane--) {
      if (openEnds[lane] <= block.start) openEnds.splice(lane, 1);
    }
    depths.set(block.id, openEnds.length);
    openEnds.push(block.end);
  }
  return depths;
}

export type AvailabilityPayload = {
  timezone: string;
  slot_minutes: number;
  recurring: { weekday: number; start: string; end: string }[];
  dated: { date: string; start: string; end: string }[];
  exceptions?: { date: string; start: string; end: string }[];
};

/** The shape the client sends. `weekday` is 1 = Monday here, as the API counts them. */
export function toPayload(blocks: AvailabilityBlock[], timezone: string): AvailabilityPayload {
  const span = (block: AvailabilityBlock) => ({ start: formatTime24(block.start), end: formatTime24(block.end) });
  const payload: AvailabilityPayload = {
    timezone,
    slot_minutes: SLOT_MINUTES,
    recurring: blocks
      .filter((block): block is RecurringBlock => block.kind === 'recurring')
      .map(block => ({ weekday: block.weekday + 1, ...span(block) })),
    dated: blocks
      .filter((block): block is DatedBlock => block.kind === 'dated')
      .map(block => ({ date: block.date, ...span(block) })),
  };

  const exceptions = blocks
    .filter((block): block is ExceptionBlock => block.kind === 'exception')
    .map(block => ({ date: block.date, ...span(block) }));
  // Omitted rather than sent empty: an absent key and "no exceptions" read alike, and the key only
  // exists at all if the three-kind model survives review.
  if (exceptions.length > 0) payload.exceptions = exceptions;

  return payload;
}

/** The viewer's zone, or `local` where the browser will not say. */
export function localTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

/**
 * The inverse of {@link toPayload}: what the server holds, as blocks the calendar can draw.
 *
 * Two details have to be undone exactly, or a saved schedule reads back wrong:
 *
 * - **`weekday` is one-based on the wire** and zero-based here, so it loses the one `toPayload`
 *   added. Getting this wrong shifts a whole week by a day and nothing throws.
 * - **`exceptions` is absent rather than empty** when there are none, so it is read defensively.
 *
 * Ids are generated on read. They exist so the editor can track a block across a drag; the server
 * has no reason to know them, and a block is identified by its kind, key and span regardless.
 */
export function fromPayload(payload: AvailabilityPayload): AvailabilityBlock[] {
  let sequence = 0;
  const id = (kind: string) => `${kind}-${sequence++}`;

  const recurring: AvailabilityBlock[] = payload.recurring.map(block => ({
    id: id('recurring'),
    kind: 'recurring' as const,
    weekday: block.weekday - 1,
    start: parseTime24(block.start),
    end: parseTime24(block.end),
  }));

  const dated: AvailabilityBlock[] = payload.dated.map(block => ({
    id: id('dated'),
    kind: 'dated' as const,
    date: block.date,
    start: parseTime24(block.start),
    end: parseTime24(block.end),
  }));

  const exceptions: AvailabilityBlock[] = (payload.exceptions ?? []).map(block => ({
    id: id('exception'),
    kind: 'exception' as const,
    date: block.date,
    start: parseTime24(block.start),
    end: parseTime24(block.end),
  }));

  return [...recurring, ...dated, ...exceptions];
}

/** `"18:30"` -> 1110. The inverse of {@link formatTime24}. */
export function parseTime24(value: string) {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}
