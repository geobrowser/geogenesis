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

export function yearOptions(now = new Date()): number[] {
  const latest = now.getUTCFullYear();
  const years: number[] = [];
  for (let year = latest; year >= EARLIEST_YEAR; year--) years.push(year);
  return years;
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
 */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const from = fromGraphDate(start);
  const to = fromGraphDate(end);

  if (!from) return to ? `Until ${formatMonthYear(to)}` : null;
  if (!to) return `${formatMonthYear(from)} – Present`;

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
  const total = months + 1;
  const years = Math.floor(total / 12);
  const remainder = total % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'yr' : 'yrs'}`);
  if (remainder > 0) parts.push(`${remainder} ${remainder === 1 ? 'mo' : 'mos'}`);

  return parts.join(' ') || null;
}
