'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { addDays, nyDayKey, nyDayStartMs } from './best-debates-views';
import { fetchBestDebatesWindow } from './fetch-best-debates-window';
import { type BlockRankersStatus, type UseBlockRankersResult, useBlockRankers } from './use-block-rankers';

/** Today's New York day, re-read every minute so a page left open rolls over at midnight. */
export function useNyTodayKey(now: () => number = Date.now): string {
  const [todayKey, setTodayKey] = React.useState(() => nyDayKey(now()));
  React.useEffect(() => {
    const timer = window.setInterval(() => setTodayKey(nyDayKey(now())), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);
  return todayKey;
}

/** The debates published from `fromDayKey` through `toDayKey` (New York days, inclusive), Best first. */
export function useBestDebatesWindow({
  fromDayKey,
  toDayKey,
  enabled = true,
}: {
  fromDayKey: string;
  toDayKey: string;
  enabled?: boolean;
}) {
  const fromMs = nyDayStartMs(fromDayKey);
  const toMs = nyDayStartMs(addDays(toDayKey, 1));
  return useQuery({
    queryKey: ['best-debates-window', fromDayKey, toDayKey],
    enabled,
    staleTime: 60_000,
    queryFn: () => fetchBestDebatesWindow({ fromMs, toMs }),
  });
}

export type BestDebatesRankersStatus = BlockRankersStatus;

/** What the block reads from the shared ballot reader (GEO-3686). */
export type BestDebatesRankers = {
  /**
   * `ready` also covers a failed re-read that kept the last good answer; counts are only trusted,
   * and "Not ranked yet" only shown, when this is `ready`.
   */
  status: BestDebatesRankersStatus;
  /** Null unless `ready`, so nothing is called unranked off a pending or failed read. */
  rankerCount: (entityId: string) => number | null;
  /** Re-reads the block (Retry after a failed first read). */
  retry: () => Promise<unknown>;
};

export function toBestDebatesRankers(result: UseBlockRankersResult): BestDebatesRankers {
  return { status: result.status, rankerCount: result.rankerCount, retry: result.invalidate };
}

export function useBestDebatesRankers({
  blockId,
  spaceId,
}: {
  blockId: string | null;
  spaceId: string;
}): BestDebatesRankers {
  return toBestDebatesRankers(useBlockRankers({ blockId, spaceId, enabled: Boolean(blockId) }));
}
