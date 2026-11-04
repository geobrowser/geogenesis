/**
 * The zone a person's own schedule is edited in (GEO-3582).
 *
 * The server keeps the zone a schedule was saved in, and Save stamps the zone the browser is in
 * now (`useSaveDebateSchedule`). For someone who has travelled since, the two differ, so the editor
 * converts the saved hours into the current zone on the way in: the same instants, drawn in the only
 * zone the grid can honestly draw. Saving then changes nothing they did not change.
 */
import { type AvailabilityBlock, DAY_END_HOUR, SLOT_MINUTES, mergeBlocks } from './blocks';
import { zonedClock, zonedWallClockInstant } from './peer-schedule';

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT']);
const DAY_MINUTES = DAY_END_HOUR * 60;
const DAY_MS = 86_400_000;

/**
 * A zone as a person would name it — `Eastern Time (New York)`. The raw id alone means little to
 * most people, and the generic name alone cannot tell two cities in one zone apart. Falls back to
 * the city where `Intl` will not name it.
 */
export function timezoneLabel(zone: string): string {
  if (zone === 'local') return 'your local time';
  if (UTC_ZONES.has(zone)) return 'UTC';
  const city = (zone.split('/').at(-1) ?? zone).replace(/_/g, ' ');
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    return name ? `${name} (${city})` : city;
  } catch {
    return city;
  }
}

/** The zone's offset from UTC at `at`, as `Intl` writes it (`GMT-05:00`); `undefined` if unreadable. */
function offsetAt(zone: string, at: Date): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find(part => part.type === 'timeZoneName')?.value;
  } catch {
    return undefined;
  }
}

/**
 * Whether hours saved in `saved` mean something else in `current`. Two ids for the same clock
 * (`America/Detroit`, `America/New_York`) do not: checked in January and July, so a zone that only
 * matches outside daylight saving still counts as different. An unreadable zone is left alone,
 * since there is nothing to convert it with.
 */
export function timezoneChanges(saved: string | undefined, current: string): boolean {
  if (!saved || saved === current || saved === 'local' || current === 'local') return false;
  const year = new Date().getUTCFullYear();
  return [new Date(Date.UTC(year, 0, 15)), new Date(Date.UTC(year, 6, 15))].some(at => {
    const savedOffset = offsetAt(saved, at);
    const currentOffset = offsetAt(current, at);
    return savedOffset !== undefined && currentOffset !== undefined && savedOffset !== currentOffset;
  });
}

/** `2026-11-03` as the UTC midnight of that date, so dates can be stepped and weekdays read. */
function dateMs(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function isoOf(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Monday, as blocks count them. */
function weekdayOf(date: string) {
  return (new Date(dateMs(date)).getUTCDay() + 6) % 7;
}

/**
 * One block's span, `start`–`end` minutes on `date` in `from`, as the pieces it covers in `to`: one,
 * or two where the move carries it over midnight.
 *
 * Kept on the slot grid by shrinking inward — a zone off by a quarter hour (Nepal) would otherwise
 * leave a block the grid cannot drag, and offering fifteen minutes someone never said is worse
 * than leaving fifteen out.
 */
function convertSpan(date: string, start: number, end: number, from: string, to: string) {
  const startAt = zonedWallClockInstant(dateMs(date) + start * 60_000, from);
  const endAt = zonedWallClockInstant(dateMs(date) + end * 60_000, from);
  const first = zonedClock(startAt, to);
  const last = zonedClock(endAt, to);

  // The end as minutes past the start date's midnight, so a span over midnight runs past 1440.
  const endMinutes = last.minutes + (dateMs(last.date) - dateMs(first.date)) / 60_000;
  const snappedStart = Math.ceil(first.minutes / SLOT_MINUTES) * SLOT_MINUTES;
  const snappedEnd = Math.floor(endMinutes / SLOT_MINUTES) * SLOT_MINUTES;

  const pieces: { date: string; start: number; end: number }[] = [];
  if (snappedStart < Math.min(snappedEnd, DAY_MINUTES)) {
    pieces.push({ date: first.date, start: snappedStart, end: Math.min(snappedEnd, DAY_MINUTES) });
  }
  if (snappedEnd > DAY_MINUTES) {
    pieces.push({
      date: isoOf(dateMs(first.date) + DAY_MS),
      start: Math.max(snappedStart - DAY_MINUTES, 0),
      end: snappedEnd - DAY_MINUTES,
    });
  }
  return pieces;
}

/**
 * A schedule saved in `from`, as the same instants drawn in `to`.
 *
 * Dated blocks and exceptions convert on their own date. A weekly block has no date, so it converts
 * on this week's — exact until one of the two zones changes clocks, when it is out by that hour
 * until the person saves again.
 */
export function convertBlocks(
  blocks: AvailabilityBlock[],
  from: string,
  to: string,
  now: Date = new Date()
): AvailabilityBlock[] {
  const today = zonedClock(now, from).date;
  const monday = dateMs(today) - weekdayOf(today) * DAY_MS;

  let sequence = 0;
  const converted = blocks.flatMap((block): AvailabilityBlock[] => {
    const date = block.kind === 'recurring' ? isoOf(monday + block.weekday * DAY_MS) : block.date;
    return convertSpan(date, block.start, block.end, from, to).map(piece => {
      const id = `${block.id}-${sequence++}`;
      return block.kind === 'recurring'
        ? { id, kind: 'recurring', weekday: weekdayOf(piece.date), start: piece.start, end: piece.end }
        : { id, kind: block.kind, date: piece.date, start: piece.start, end: piece.end };
    });
  });
  // Snapping or a clock change can leave two pieces touching; they read as one window.
  return mergeBlocks(converted);
}

/**
 * The line under "Set your debate schedule" saying which zone the hours are in. When they were
 * converted it says from where, so a week that was 9–5 at home and now reads 6pm–2am does not
 * look scrambled.
 */
export function scheduleTimezoneNote({
  savedTimezone,
  currentTimezone,
  converted,
}: {
  savedTimezone?: string;
  currentTimezone: string;
  converted: boolean;
}): string {
  const current = timezoneLabel(currentTimezone);
  if (!converted || !savedTimezone) return `Times are in ${current}.`;
  return `Times are in ${current}, converted from ${timezoneLabel(savedTimezone)} where you set them.`;
}
