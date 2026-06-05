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

export function getRankingPeriodState(startDate: string, endDate: string, now = new Date()): RankingPeriodState {
  const start = parseRankingDate(startDate);
  const end = parseRankingDate(endDate);

  if (!start && !end) return 'no-date';

  if (end && differenceInCalendarDays(end, now) < 0) return 'ended';

  if (start && differenceInCalendarDays(start, now) > 0) return 'not-started';

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
      const days = differenceInCalendarDays(start, now);
      if (days === 1) return 'Starts in 1 day';
      return `Starts in ${days} days`;
    }
    case 'in-progress': {
      const end = parseRankingDate(endDate);
      if (!end) return null;
      const days = differenceInCalendarDays(end, now);
      if (days > 0) return days === 1 ? 'Ends in 1 day' : `Ends in ${days} days`;
      if (days === 0) return 'Ends today';
      return null;
    }
    case 'ended':
      return 'Ended';
  }
}

export function rankingSubmissionsOpen(state: RankingPeriodState): boolean {
  return state === 'in-progress' || state === 'no-date';
}
