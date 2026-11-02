import { type AvailabilityBlock, effectiveAvailability, isoDate, mondayOf, weekDates } from './blocks';
import { zonedWallClockInstant } from './peer-schedule';

/**
 * Whether a saved schedule still offers any time from `now` on: something others could book.
 *
 * `is_set` alone cannot say this. It stays true once a schedule has ever been saved, through a
 * schedule cleared back to nothing and through one whose only times were one-off dates now past.
 *
 * A weekly block always has a next occurrence, since an exception only removes a single date. A
 * one-off block counts until its last range, after exceptions, has ended in the schedule's zone.
 */
export function hasUpcomingAvailability(
  blocks: AvailabilityBlock[] | undefined,
  scheduleZone: string | undefined,
  now: Date = new Date()
): boolean {
  if (!blocks) return false;
  if (blocks.some(block => block.kind === 'recurring' && block.end > block.start)) return true;

  const datedDates = new Set(blocks.flatMap(block => (block.kind === 'dated' ? [block.date] : [])));
  for (const date of datedDates) {
    const [year, month, day] = date.split('-').map(Number);
    // `effectiveAvailability` reads a date's weekday from its place in a Monday-first week.
    const week = weekDates(mondayOf(new Date(year, month - 1, day))).map(isoDate);
    const ranges = effectiveAvailability(blocks, week).find(entry => entry.date === date)?.ranges ?? [];
    const lastEnd = ranges.at(-1)?.[1];
    if (
      lastEnd !== undefined &&
      zonedWallClockInstant(Date.UTC(year, month - 1, day, 0, lastEnd), scheduleZone).getTime() > now.getTime()
    ) {
      return true;
    }
  }
  return false;
}
