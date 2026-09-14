/**
 * Month-and-year dates for work and education.
 *
 * Every date already in the graph lands on the first of a month — most on the
 * first of January — so the stored precision is a month at best and usually a
 * year. A day picker would advertise a precision nobody has and nobody filling
 * in a CV remembers, so two dropdowns write `YYYY-MM-01Z`.
 */

export type MonthYear = { month: number; year: number };

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Oldest year offered. Comfortably before any plausible CV entry. */
const EARLIEST_YEAR = 1950;

/**
 * Years to offer, newest first.
 *
 * The present is the ceiling. Education briefly reached past it, for an expected
 * graduation — but a degree in progress is recorded by having no end date at
 * all, so a date in the future would have said it had finished. Offering the
 * years again needs a status that can carry "in progress" first.
 */
export function yearOptions(now = new Date()): number[] {
  const years: number[] = [];
  for (let year = now.getUTCFullYear(); year >= EARLIEST_YEAR; year--) years.push(year);
  return years;
}

/**
 * Whether a picked pair runs forwards. Both halves optional, because an unfinished
 * pair is not wrong yet — only a complete one can be backwards.
 *
 * The renderer already refuses to show a negative duration, but that only hides
 * the problem: without this the bad range still reaches the graph.
 */
export function isOrderedRange(start: MonthYear | null, end: MonthYear | null): boolean {
  if (!start || !end) return true;
  return end.year > start.year || (end.year === start.year && end.month >= start.month);
}

export function toGraphDate({ month, year }: MonthYear): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01Z`;
}

/**
 * Reads a stored date back into the two dropdowns. Tolerant on purpose: these
 * strings were written by other tools over several years, so anything with a
 * usable year and month is accepted rather than only the exact shape we write.
 */
export function fromGraphDate(value: string | null | undefined): MonthYear | null {
  if (!value) return null;

  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return { month, year };
}

/**
 * How a row reads in the resting state: `Jun 2022 – Jan 2024`, or `– Present`
 * where a role is still held.
 *
 * An entry with no start at all renders as nothing rather than a lone dash —
 * about a third of the records in the graph carry no dates, and a dash on its
 * own reads as a rendering fault rather than as missing data.
 *
 * `isOpen` is what an absent end date means for this row. Employment says so
 * through its status; education has three states, only one of which is ongoing.
 */
export function formatDateRange(start: string | null, end: string | null, isOpen = true): string | null {
  const from = fromGraphDate(start);
  const to = fromGraphDate(end);

  if (!from) return to ? `Until ${formatMonthYear(to)}` : null;
  // A missing end date does not mean "still going". A completed degree may
  // simply not record when it finished, and calling that Present is the exact
  // ambiguity the three-way education status was added to settle.
  if (!to) return isOpen ? `${formatMonthYear(from)} – Present` : formatMonthYear(from);

  return `${formatMonthYear(from)} – ${formatMonthYear(to)}`;
}

function formatMonthYear({ month, year }: MonthYear): string {
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
}

/**
 * How long a stretch ran, the way a CV states it: `4 yrs 2 mos`.
 *
 * Rounded to whole months from the first of each, which is all the stored
 * precision supports. An open range runs to today, so a role still held keeps
 * counting.
 */
export function formatDuration(start: string | null, end: string | null, now = new Date()): string | null {
  const from = fromGraphDate(start);
  if (!from) return null;

  const to = fromGraphDate(end) ?? { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };

  const months = (to.year - from.year) * 12 + (to.month - from.month);
  if (months < 0) return null;

  // Inclusive of the month it started in, so a job begun and left in March reads
  // as a month rather than as nothing at all.
  return formatMonths(months + 1);
}

function formatMonths(total: number): string | null {
  const years = Math.floor(total / 12);
  const remainder = total % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (remainder > 0) parts.push(`${remainder} ${remainder === 1 ? 'mo' : 'mos'}`);

  return parts.join(' ') || null;
}

/** One stretch of time a row covers. `isOpen` runs it up to the present. */
export type DurationInterval = { start: string | null; end: string | null; isOpen: boolean };

/**
 * How long was actually spent across several rows, as against how long ago the
 * first one started.
 *
 * Earliest start to latest end counts the time in between as time served: left
 * an employer in 2016 and returned in 2024, and two years read as ten. So the
 * stretches are merged and summed, with overlapping roles — a promotion held
 * alongside the job it grew out of — counted once rather than twice.
 *
 * A row that is finished but never recorded when contributes nothing: there is
 * no stretch to measure, and assuming one would invent tenure. An employer whose
 * rows are all like that has no total, which is the honest answer.
 */
export function formatTotalDuration(intervals: DurationInterval[], now = new Date()): string | null {
  const spans: { from: number; to: number }[] = [];

  for (const interval of intervals) {
    const start = fromGraphDate(interval.start);
    if (!start) continue;

    const end = interval.isOpen
      ? { month: now.getUTCMonth() + 1, year: now.getUTCFullYear() }
      : fromGraphDate(interval.end);
    if (!end) continue;

    const from = start.year * 12 + start.month;
    const to = end.year * 12 + end.month;
    if (to < from) continue;

    spans.push({ from, to });
  }

  if (spans.length === 0) return null;

  spans.sort((a, b) => a.from - b.from);

  let total = 0;
  let current = spans[0]!;

  for (const span of spans.slice(1)) {
    // Touching counts as continuous: March to June then July to September is one
    // unbroken stretch, and inclusive months make either reading the same total.
    if (span.from <= current.to + 1) {
      current = { from: current.from, to: Math.max(current.to, span.to) };
      continue;
    }

    total += current.to - current.from + 1;
    current = span;
  }

  total += current.to - current.from + 1;

  return formatMonths(total);
}
