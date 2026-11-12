'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type RecentDebate, TO_RANK_WINDOW_DAYS, fetchRecentDebates, selectToRank } from './best-debates-debates';
import type { UseBlockRankersResult } from './use-block-rankers';

/** The parts of `useBlockRankers` (GEO-3686) the ranking screen reads. */
export type RankersRead = Pick<UseBlockRankersResult, 'status' | 'rankerCount' | 'rankersOf' | 'invalidate'>;

export type RankedByLabel =
  | { kind: 'nobody' }
  | { kind: 'ranked'; names: string[]; count: number }
  /** Unknown yet, or the read failed: show nothing rather than a wrong "Nobody". */
  | { kind: 'unknown' };

/**
 * What To rank says under a debate: "Nobody has ranked this yet", who has, or nothing. "Nobody" is
 * said only off a finished read whose count is 0; anything else unknown shows no badge.
 */
export function rankedByLabel(rankers: RankersRead, entityId: string): RankedByLabel {
  if (rankers.status !== 'ready') return { kind: 'unknown' };
  const count = rankers.rankerCount(entityId);
  if (count == null) return { kind: 'unknown' };
  if (count === 0) return { kind: 'nobody' };
  const names = (rankers.rankersOf(entityId) ?? [])
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

/** Re-reads who ranked what once a publish has been indexed, never before (see `invalidate`). */
export function refreshRankersAfterIndexing(rankers: RankersRead, indexingSettled: Promise<unknown>) {
  void indexingSettled.then(() => rankers.invalidate()).catch(() => {});
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * The To rank list for the Best debates ranking screen: the last 7 days' debates not in
 * `excludeEntityIds`, nobody-ranked first, then newest (see `selectToRank`). The window is read once an hour; the list itself follows the
 * ranker's draft as they place debates.
 */
export function useBestDebatesToRank({
  enabled,
  excludeEntityIds,
  rankers,
}: {
  enabled: boolean;
  excludeEntityIds: readonly string[];
  /** Orders debates nobody has ranked first, once its read is ready. */
  rankers: RankersRead;
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
  const rankerCount = rankers.status === 'ready' ? rankers.rankerCount : undefined;
  const debates = React.useMemo(
    () => (recent ? selectToRank(recent, excludeEntityIds, Date.now(), { rankerCount }) : []),
    [recent, excludeEntityIds, rankerCount]
  );

  return {
    debates,
    isLoading: enabled && query.isLoading,
    error: enabled ? (query.error ?? null) : null,
  };
}
