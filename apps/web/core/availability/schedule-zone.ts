/**
 * The zone a person's own schedule is edited in (GEO-3582).
 *
 * The server keeps the zone a schedule was saved in, and Save stamps the zone the browser is in
 * now (`useSaveDebateSchedule`). For someone who has travelled since, the two differ, so the editor
 * converts the saved hours into the current zone on the way in: the same instants, drawn in the only
 * zone the grid can honestly draw. Saving then changes nothing they did not change.
 */
import { type AvailabilityBlock, DAY_END_HOUR, SLOT_MINUTES, mergeBlocks } from './blocks';
import { DAY_MS, zonedClock, zonedWallClockInstant } from './peer-schedule';

const UTC_ZONES = new Set(['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT']);
const DAY_MINUTES = DAY_END_HOUR * 60;

/** `Madrid` from `Europe/Madrid`, `New York` from `America/New_York`: a zone as people say it. */
export function zoneCity(timezone: string): string {
  const city = timezone.split('/').at(-1) ?? timezone;
  return city.replace(/_/g, ' ');
}

/**
 * A zone as a person would name it — `Eastern Time (New York)`. The raw id alone means little to
 * most people, and the generic name alone cannot tell two cities in one zone apart. Falls back to
 * the city where `Intl` will not name it.
 */
export function timezoneLabel(zone: string): string {
  if (zone === 'local') return 'your local time';
  if (UTC_ZONES.has(zone)) return 'UTC';
  const city = zoneCity(zone);
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value;
    // `Etc/GMT+5` is POSIX for five hours *behind*: its "city" contradicts the name (`GMT-05:00`).
    if (name && zone.startsWith('Etc/')) return name;
    return name ? `${name} (${city})` : city;
  } catch {
    return city;
  }
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
 * A weekly block has no date, so it converts on this week's — exact until one of the two zones
 * changes clocks, when it is out by that hour until the person saves again. An exception only
 * exists to cut time out of a weekly block, so it converts on this week's matching day too and
 * moves back to its own date: converted on its own date, a clock change between the two would
 * leave it an hour off the block it cancels, offering time the person said they don't have.
 * Dated blocks stand alone and convert on their own date, exactly.
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
    const thisWeek = (weekday: number) => isoOf(monday + weekday * DAY_MS);
    const date =
      block.kind === 'recurring'
        ? thisWeek(block.weekday)
        : block.kind === 'exception'
          ? thisWeek(weekdayOf(block.date))
          : block.date;
    // Days from the date converted on to the date the block belongs on: zero but for exceptions.
    const shift = block.kind === 'exception' ? dateMs(block.date) - dateMs(date) : 0;
    return convertSpan(date, block.start, block.end, from, to).map(piece => {
      const id = `${block.id}-${sequence++}`;
      return block.kind === 'recurring'
        ? { id, kind: 'recurring', weekday: weekdayOf(piece.date), start: piece.start, end: piece.end }
        : { id, kind: block.kind, date: isoOf(dateMs(piece.date) + shift), start: piece.start, end: piece.end };
    });
  });
  // Snapping or a clock change can leave two pieces touching; they read as one window.
  return mergeBlocks(converted);
}

/** A block's kind, day and span: what it means, without the id the editor gives it. */
function spanKey(block: AvailabilityBlock) {
  const day = block.kind === 'recurring' ? block.weekday : block.date;
  return `${block.kind}|${day}|${block.start}|${block.end}`;
}

function sameSpans(a: AvailabilityBlock[], b: AvailabilityBlock[]) {
  const keys = (blocks: AvailabilityBlock[]) => blocks.map(spanKey).sort().join(',');
  return keys(a) === keys(b);
}

/**
 * A saved schedule as the person sees it: converted into the zone they are in now, or as saved
 * where that changes nothing. The one place the decision is made, so the editor and the summaries
 * that open it can never show one slot at two different hours.
 *
 * Converted whenever the zones differ, and counted as converted only if a block moved. Comparing the
 * zones' offsets instead, on any fixed set of dates, misses pairs that part only for a few weeks
 * (Casablanca leaves Algiers' clock for Ramadan) — and a dated block in those weeks then keeps
 * hours that name another instant. Converting already resolves each block on its own day.
 *
 * `currentTimezone` is required, not defaulted, so a caller that memoises this has the zone in
 * hand to list as a dependency.
 */
export function scheduleInCurrentZone(
  blocks: AvailabilityBlock[],
  savedTimezone: string | undefined,
  currentTimezone: string,
  now: Date = new Date()
): { blocks: AvailabilityBlock[]; converted: boolean } {
  if (blocks.length === 0 || !savedTimezone || savedTimezone === currentTimezone) {
    return { blocks, converted: false };
  }
  const converted = convertBlocks(blocks, savedTimezone, currentTimezone, now);
  // Unmoved, the saved blocks themselves: the editor tells edits apart by reference.
  return sameSpans(converted, blocks) ? { blocks, converted: false } : { blocks: converted, converted: true };
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
