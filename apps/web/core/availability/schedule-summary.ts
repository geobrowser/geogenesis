import { type AvailabilityBlock, type RecurringBlock, formatTime, mergeBlocks } from './blocks';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Past this many distinct day groups a one-line summary stops being scannable — "Mon 9am · Tue 10am
 * · Wed…" is the grid again, badly — so it falls back to a count.
 */
const MAX_GROUPS = 3;

/**
 * One line describing a saved week, for places too small to draw the grid: `Mon–Fri 6–8pm · Sat
 * 10am–12pm`. Null when there is nothing to describe.
 *
 * Only recurring blocks are summarised. One-off dates and exceptions are real availability, but
 * "free next Thursday" in a summary of the week reads as though it repeats, so a schedule made only
 * of dates says so instead of pretending to a pattern.
 */
export function summarizeSchedule(blocks: AvailabilityBlock[]): string | null {
  const recurring = mergeBlocks(blocks).filter((block): block is RecurringBlock => block.kind === 'recurring');

  if (recurring.length === 0) {
    return blocks.some(block => block.kind === 'dated') ? 'Free on specific dates' : null;
  }

  // Days that share exactly the same hours are one group, so a working-week pattern reads as one
  // phrase rather than five.
  const hoursByDay = WEEKDAY_LABELS.map((_, weekday) =>
    recurring
      .filter(block => block.weekday === weekday)
      .sort((a, b) => a.start - b.start)
      .map(block => formatRange(block.start, block.end))
      .join(', ')
  );

  const groups = new Map<string, number[]>();
  hoursByDay.forEach((hours, weekday) => {
    if (!hours) return;
    groups.set(hours, [...(groups.get(hours) ?? []), weekday]);
  });

  const freeDays = hoursByDay.filter(Boolean).length;
  if (groups.size > MAX_GROUPS) return `Free ${freeDays} days a week`;

  return [...groups].map(([hours, weekdays]) => `${formatDays(weekdays)} ${hours}`).join(' · ');
}

/** `6–8pm` when both ends share a half of the day, `10am–12pm` when they do not. */
function formatRange(start: number, end: number) {
  const from = formatTime(start);
  const to = formatTime(end % (24 * 60));
  const suffix = to.slice(-2);
  return from.endsWith(suffix) ? `${from.slice(0, -2)}–${to}` : `${from}–${to}`;
}

/** `Every day`, `Mon–Fri`, `Sat, Sun`, `Mon, Wed–Fri`: runs of three or more collapse to a range. */
function formatDays(weekdays: number[]) {
  if (weekdays.length === 7) return 'Every day';

  const runs: number[][] = [];
  for (const day of weekdays) {
    const run = runs.at(-1);
    if (run && run.at(-1) === day - 1) run.push(day);
    else runs.push([day]);
  }

  return runs
    .flatMap(run =>
      run.length >= 3
        ? [`${WEEKDAY_LABELS[run[0]]}–${WEEKDAY_LABELS[run[run.length - 1]]}`]
        : run.map(day => WEEKDAY_LABELS[day])
    )
    .join(', ');
}
