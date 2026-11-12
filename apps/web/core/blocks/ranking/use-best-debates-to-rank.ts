'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type RecentDebate, TO_RANK_WINDOW_DAYS, fetchRecentDebates, selectToRank } from './best-debates-debates';
import type { BlockRanker } from './use-block-rankers';

/**
 * The parts of `useBlockRankers` (GEO-3686) the ranking screen reads.
 *
 * Written against both shapes of the reader: the one on the base branch (`isLoading`, `error`,
 * counts that read 0 until ready) and the reviewed one (`status`, `rankerCount` returning null until
 * ready, `invalidate`). Once the reviewed reader lands everywhere, `status` and `invalidate` stop
 * being optional and the fallbacks below go.
 */
export type RankersRead = {
  rankersOf: (entityId: string) => BlockRanker[];
  rankerCount: (entityId: string) => number | null;
  isLoading: boolean;
  error: Error | null;
  status?: 'disabled' | 'loading' | 'error' | 'ready';
  refetch: () => Promise<unknown>;
  invalidate?: () => Promise<unknown> | void;
};

export type RankersStatus = NonNullable<RankersRead['status']>;

export function rankersStatus(rankers: RankersRead): RankersStatus {
  if (rankers.status) return rankers.status;
  if (rankers.error) return 'error';
  if (rankers.isLoading) return 'loading';
  return 'ready';
}

export type RankedByLabel =
  | { kind: 'nobody' }
  | { kind: 'ranked'; names: string[]; count: number }
  /** Unknown yet, or the read failed: show nothing rather than a wrong "Nobody". */
  | { kind: 'unknown' };

/**
 * What To rank says under a debate: "Nobody has ranked this yet", who has, or nothing. "Nobody" is
 * only ever said off a finished read; a loading or failed read counts 0 and must not claim it.
 */
export function rankedByLabel(rankers: RankersRead, entityId: string): RankedByLabel {
  if (rankersStatus(rankers) !== 'ready') return { kind: 'unknown' };
  const count = rankers.rankerCount(entityId);
  if (count == null) return { kind: 'unknown' };
  if (count === 0) return { kind: 'nobody' };
  const names = rankers
    .rankersOf(entityId)
    .map(ranker => ranker.name?.trim())
    .filter((name): name is string => Boolean(name));
  return { kind: 'ranked', names, count };
}

/** "Ranked by Ana, Ben and 2 others" / "Ranked by 3 people" while names resolve. */
export function rankedByText(label: Extract<RankedByLabel, { kind: 'ranked' }>): string {
  const { names, count } = label;
  if (names.length === 0) return count === 1 ? 'Ranked by 1 person' : `Ranked by ${count} people`;
  const shown = names.slice(0, 2);
  const others = count - shown.length;
  if (others <= 0) return `Ranked by ${shown.join(shown.length === 2 ? ' and ' : '')}`;
  return `Ranked by ${shown.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`;
}

/** Re-reads who ranked what once a publish has been indexed. */
export function refreshRankersAfterIndexing(rankers: RankersRead, indexingSettled: Promise<void>) {
  void indexingSettled.then(() => (rankers.invalidate ? rankers.invalidate() : rankers.refetch())).catch(() => {});
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The To rank list for the Best debates ranking screen: the last 7 days' debates not in
 * `excludeEntityIds`, newest first. The window is read once an hour; the list itself follows the
 * ranker's draft as they place debates.
 */
export function useBestDebatesToRank({
  enabled,
  excludeEntityIds,
}: {
  enabled: boolean;
  excludeEntityIds: readonly string[];
}): { debates: RecentDebate[]; isLoading: boolean; error: Error | null } {
  // Rounded to the hour so the query key, and with it the cache, holds steady between renders.
  const nowHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const query = useQuery({
    queryKey: ['best-debates-recent-debates', TO_RANK_WINDOW_DAYS, nowHour],
    enabled,
    staleTime: 5 * 60 * 1000,
    // From the top of the hour, so the read covers the window and `selectToRank` trims it exactly.
    queryFn: () => fetchRecentDebates(nowHour),
  });

  const recent = query.data;
  const debates = React.useMemo(
    () => (recent ? selectToRank(recent, excludeEntityIds, Date.now()) : []),
    [recent, excludeEntityIds]
  );

  return {
    debates,
    isLoading: enabled && query.isLoading,
    error: enabled ? (query.error ?? null) : null,
  };
}
