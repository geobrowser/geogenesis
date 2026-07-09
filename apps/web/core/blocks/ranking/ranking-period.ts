import { differenceInCalendarDays, parseISO } from 'date-fns';

import { GeoDate } from '~/core/utils/utils';

export type RankingPeriodState = 'no-date' | 'not-started' | 'in-progress' | 'ended';

function parseRankingDate(iso: string): Date | null {
  if (!iso.trim()) return null;
  try {
    return parseISO(GeoDate.toFullISOString(iso));
  } catch {
    return null;
  }
}

/** Date-only values (legacy DATE properties) are compared by calendar day; datetimes use timestamps. */
function isDateOnlyValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function hasRankingEnded(end: Date, endDateString: string, now: Date): boolean {
  if (isDateOnlyValue(endDateString)) {
    return differenceInCalendarDays(end, now) < 0;
  }
  return end.getTime() <= now.getTime();
}

function hasRankingNotStarted(start: Date, startDateString: string, now: Date): boolean {
  if (isDateOnlyValue(startDateString)) {
    return differenceInCalendarDays(start, now) > 0;
  }
  return start.getTime() > now.getTime();
}

function formatRelativeCountdown(prefix: 'Starts' | 'Ends', target: Date, now: Date): string | null {
  const msRemaining = target.getTime() - now.getTime();
  if (msRemaining <= 0) return null;

  const totalMinutes = Math.ceil(msRemaining / (60 * 1000));
  const totalHours = Math.ceil(msRemaining / (60 * 60 * 1000));

  if (totalMinutes < 60) {
    return `${prefix} in ${totalMinutes} min`;
  }
  if (totalHours < 24) {
    return totalHours === 1 ? `${prefix} in 1 hr` : `${prefix} in ${totalHours} hrs`;
  }

  const days = differenceInCalendarDays(target, now);
  if (days > 0) return days === 1 ? `${prefix} in 1 day` : `${prefix} in ${days} days`;
  // Same calendar day but >= 24h remaining (timezone edge) — still show hours.
  return `${prefix} in ${totalHours} hrs`;
}

export function getRankingPeriodState(startDate: string, endDate: string, now = new Date()): RankingPeriodState {
  const start = parseRankingDate(startDate);
  const end = parseRankingDate(endDate);

  if (!start && !end) return 'no-date';

  if (end && hasRankingEnded(end, endDate, now)) return 'ended';

  if (start && hasRankingNotStarted(start, startDate, now)) return 'not-started';

  return 'in-progress';
}

export function formatRankingPeriodLabel(
  state: RankingPeriodState,
  startDate: string,
  endDate: string,
  now = new Date()
): string | null {
  switch (state) {
    case 'no-date':
      return null;
    case 'not-started': {
      const start = parseRankingDate(startDate);
      if (!start) return null;
      return formatRelativeCountdown('Starts', start, now);
    }
    case 'in-progress': {
      const end = parseRankingDate(endDate);
      if (!end) return null;

      const label = formatRelativeCountdown('Ends', end, now);
      return label ?? 'Ended';
    }
    case 'ended':
      return 'Ended';
  }
}

export function rankingSubmissionsOpen(state: RankingPeriodState): boolean {
  return state === 'in-progress' || state === 'no-date';
}
