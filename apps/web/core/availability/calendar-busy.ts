/**
 * Busy time from the viewer's own connected calendar, placed on their week grid. Display only:
 * geo-chat subtracts it from availability itself, and peers never see it.
 */

/** Absolute instants, as `/me/calendar-busy` answers them. */
export type BusyInterval = { start: string; end: string };

/** One shaded stretch inside a day, in minutes from local midnight. */
export type BusySegment = { start: number; end: number };

/** Inside geo-chat's 92-day cap on `/me/calendar-busy`, which is also how far ahead it syncs. */
export const CALENDAR_BUSY_WINDOW_DAYS = 90;

/** From this week's Monday (the earliest week the grid opens on), 90 local days midnight to midnight. */
export function calendarBusyWindow(now: Date) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + CALENDAR_BUSY_WINDOW_DAYS);
  return { from: monday.toISOString(), to: to.toISOString() };
}

const minutesIntoDay = (instant: number) => {
  const date = new Date(instant);
  return date.getHours() * 60 + date.getMinutes();
};

/** The busy intervals that fall on `date` (local), clipped to it. */
export function busySegmentsForDate(intervals: BusyInterval[], date: Date): BusySegment[] {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();

  const segments: BusySegment[] = [];
  for (const interval of intervals) {
    const start = Date.parse(interval.start);
    const end = Date.parse(interval.end);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= dayStart || start >= dayEnd) continue;

    const segment = {
      start: start <= dayStart ? 0 : minutesIntoDay(start),
      end: end >= dayEnd ? 24 * 60 : minutesIntoDay(end),
    };
    if (segment.end > segment.start) segments.push(segment);
  }
  return segments.sort((a, b) => a.start - b.start);
}
