'use client';

import * as React from 'react';

import { type RankingDate } from './ranking-block-dates';
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
export function useRankingPeriod(startDate: RankingDate, endDate: RankingDate) {
  const [now, setNow] = React.useState(() => new Date());

  // Depend on the primitive fields, not the object identity
  const { value: startValue, isDateOnly: startIsDateOnly } = startDate;
  const { value: endValue, isDateOnly: endIsDateOnly } = endDate;

  React.useEffect(() => {
    // Re-baseline the clock every time this runs — crucially when the dates first
    // arrive from sync after mount.
    const from = new Date();
    setNow(from);

    let timer: number | undefined;

    const scheduleFrom = (at: Date) => {
      const delay = msUntilRankingPeriodChange(startDate, endDate, at);
      if (delay === null) return;

      timer = window.setTimeout(
        () => {
          const next = new Date();
          setNow(next);
          scheduleFrom(next);
        },
        Math.max(delay, MIN_TICK_MS)
      );
    };

    scheduleFrom(from);

    return () => window.clearTimeout(timer);
    // Deliberate: `startDate`/`endDate` are prop objects whose identity changes on every parent
    // render, and the primitives destructured above are their entire content. Depending on the
    // objects would re-arm this timer on every render of whatever renders the block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startValue, startIsDateOnly, endValue, endIsDateOnly]);

  const periodState = React.useMemo(
    () => getRankingPeriodState(startDate, endDate, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above: primitives, not identity.
    [startValue, startIsDateOnly, endValue, endIsDateOnly, now]
  );

  const periodLabel = React.useMemo(
    () => formatRankingPeriodLabel(periodState, startDate, endDate, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above: primitives, not identity.
    [periodState, startValue, startIsDateOnly, endValue, endIsDateOnly, now]
  );

  return {
    periodState,
    periodLabel,
    submissionsOpen: rankingSubmissionsOpen(periodState),
  };
}
