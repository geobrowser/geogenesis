import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';

import { GeoDate } from '~/core/utils/utils';

import { type RankingDate } from './ranking-block-dates';

export type RankingPeriodState = 'no-date' | 'not-started' | 'in-progress' | 'ended';

function parseRankingDate(date: RankingDate): Date | null {
  const trimmed = date.value.trim();
  if (!trimmed) return null;
  try {
    if (date.isDateOnly) return parseISO(trimmed);
    return parseISO(GeoDate.toFullISOString(trimmed));
  } catch {
    return null;
  }
}

function hasRankingEnded(end: Date, endDate: RankingDate, now: Date): boolean {
  if (endDate.isDateOnly) {
    return differenceInCalendarDays(end, now) < 0;
  }
  return end.getTime() <= now.getTime();
}

function hasRankingNotStarted(start: Date, startDate: RankingDate, now: Date): boolean {
  if (startDate.isDateOnly) {
    return differenceInCalendarDays(start, now) > 0;
  }
  return start.getTime() > now.getTime();
}

/**
 * Countdown for a date-only window, which runs through the whole of its end day.
 */
function formatCalendarCountdown(prefix: 'Starts' | 'Ends', target: Date, now: Date): string | null {
  const days = differenceInCalendarDays(target, now);
  if (days < 0) return null;
  if (days === 0) return `${prefix} today`;
  return days === 1 ? `${prefix} in 1 day` : `${prefix} in ${days} days`;
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

/**
 * Pick the countdown that matches how the state machine reads this value.
 */
function countdownFor(date: RankingDate) {
  return date.isDateOnly ? formatCalendarCountdown : formatRelativeCountdown;
}

export function getRankingPeriodState(
  startDate: RankingDate,
  endDate: RankingDate,
  now = new Date()
): RankingPeriodState {
  const start = parseRankingDate(startDate);
  const end = parseRankingDate(endDate);

  if (!start && !end) return 'no-date';

  if (end && hasRankingEnded(end, endDate, now)) return 'ended';

  if (start && hasRankingNotStarted(start, startDate, now)) return 'not-started';

  return 'in-progress';
}

export function formatRankingPeriodLabel(
  state: RankingPeriodState,
  startDate: RankingDate,
  endDate: RankingDate,
  now = new Date()
): string | null {
  switch (state) {
    case 'no-date':
      return null;
    case 'not-started': {
      const start = parseRankingDate(startDate);
      if (!start) return null;
      return countdownFor(startDate)('Starts', start, now);
    }
    case 'in-progress': {
      const end = parseRankingDate(endDate);
      if (!end) return null;

      const label = countdownFor(endDate)('Ends', end, now);
      return label ?? 'Ended';
    }
    case 'ended':
      return 'Ended';
  }
}

export function rankingSubmissionsOpen(state: RankingPeriodState): boolean {
  return state === 'in-progress' || state === 'no-date';
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// Mirror the granularity thresholds in `formatRelativeCountdown`
const MINUTE_GRANULARITY_MAX_MS = 59 * MINUTE_MS;
const HOUR_GRANULARITY_MAX_MS = 23 * HOUR_MS;

function msUntilNextLocalMidnight(now: Date): number {
  return startOfDay(addDays(now, 1)).getTime() - now.getTime();
}

function msUntilCountdownChanges(target: Date, now: Date): number | null {
  const msRemaining = target.getTime() - now.getTime();
  if (msRemaining <= 0) return null;

  if (msRemaining <= MINUTE_GRANULARITY_MAX_MS) {
    return msRemaining % MINUTE_MS || MINUTE_MS;
  }
  if (msRemaining <= HOUR_GRANULARITY_MAX_MS) {
    return Math.min(msRemaining % HOUR_MS || HOUR_MS, msRemaining - MINUTE_GRANULARITY_MAX_MS);
  }
  return Math.min(msUntilNextLocalMidnight(now), msRemaining - HOUR_GRANULARITY_MAX_MS);
}

export function msUntilRankingPeriodChange(
  startDate: RankingDate,
  endDate: RankingDate,
  now = new Date()
): number | null {
  const state = getRankingPeriodState(startDate, endDate, now);
  if (state === 'no-date' || state === 'ended') return null;

  const targetDate = state === 'not-started' ? startDate : endDate;
  const target = parseRankingDate(targetDate);
  if (!target) return null;

  if (targetDate.isDateOnly) return msUntilNextLocalMidnight(now);

  const untilCountdownChanges = msUntilCountdownChanges(target, now);
  const untilMidnight = msUntilNextLocalMidnight(now);

  return untilCountdownChanges === null ? untilMidnight : Math.min(untilCountdownChanges, untilMidnight);
}
