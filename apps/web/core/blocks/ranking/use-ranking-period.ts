'use client';

import * as React from 'react';

import {
  formatRankingPeriodLabel,
  getRankingPeriodState,
  msUntilRankingPeriodChange,
  rankingSubmissionsOpen,
} from './ranking-period';

const MIN_TICK_MS = 250;

/**
 * Ranking period state that re-renders on its own boundaries.
 */
export function useRankingPeriod(startDate: string, endDate: string) {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    let timer: number | undefined;

    const scheduleFrom = (from: Date) => {
      const delay = msUntilRankingPeriodChange(startDate, endDate, from);
      if (delay === null) return;

      timer = window.setTimeout(() => {
        const next = new Date();
        setNow(next);
        scheduleFrom(next);
      }, Math.max(delay, MIN_TICK_MS));
    };

    scheduleFrom(new Date());

    return () => window.clearTimeout(timer);
  }, [startDate, endDate]);

  const periodState = React.useMemo(() => getRankingPeriodState(startDate, endDate, now), [startDate, endDate, now]);

  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate, now),
    [periodState, startDate, endDate, now]
  );

  return {
    periodState,
    periodLabel,
    submissionsOpen: rankingSubmissionsOpen(periodState),
  };
}
