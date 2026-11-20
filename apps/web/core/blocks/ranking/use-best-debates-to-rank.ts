'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { normId } from '~/core/utils/norm-id';

import {
  type RecentDebate,
  TO_RANK_WINDOW_DAYS,
  fetchMatchingDebates,
  fetchRecentDebates,
  selectToRank,
} from './best-debates-debates';
import {
  type RankingFilters,
  hasRankingFilters,
  rankingFilterEntityClauses,
  recordedRangeMs,
  toRankWindow,
} from './best-debates-ranking-filters';
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
 * The debates in your ranking (and the ones you down ranked) that the screen's filters leave
 * (GEO-3810): To rank can show them under a search or filter. Ranked first in your order, then down
 * ranked. Search and topics are applied by the list, as they are to the unranked debates.
 */
export type ToRankRankedMatches = {
  ranked: string[];
  downRanked: string[];
  /** The filtered read stopped at its cap: these are the matches among its first debates. */
  capped: boolean;
};

const NO_RANKED_MATCHES: ToRankRankedMatches = { ranked: [], downRanked: [], capped: false };
const NO_IDS: readonly string[] = [];

/**
 * The To rank list for the Best debates ranking screen: the last 7 days' debates not in
 * `excludeEntityIds`, nobody-ranked first, then newest (see `selectToRank`). The window is read once an hour; the list itself follows the
 * ranker's draft as they place debates.
 *
 * Under the screen's recorded, debater or claim filter (GEO-3774) the list is read from the server
 * with those filters instead: the recorded range in place of the 7 days, so older days work, and
 * only the debates the filters leave. The draft and push-downs are taken out the same way.
 *
 * `rankedMatches` holds the debates of `rankedEntityIds` and `downRankedEntityIds` the filters leave,
 * of any age (GEO-3810): every one of them without a recorded, debater or claim filter, else the ones
 * a read with those filters returns, over the recorded range when one is picked and all time when not.
 */
export function useBestDebatesToRank({
  enabled,
  excludeEntityIds,
  rankers,
  filters,
  todayKey = '',
  rankedEntityIds = NO_IDS,
  downRankedEntityIds = NO_IDS,
}: {
  enabled: boolean;
  excludeEntityIds: readonly string[];
  /** Your ranking as it stands (the draft), in order: `rankedMatches.ranked` keeps this order. */
  rankedEntityIds?: readonly string[];
  /** The debates you down ranked: `rankedMatches.downRanked`. */
  downRankedEntityIds?: readonly string[];
  /** Orders debates nobody has ranked first, once its read is ready. */
  rankers: RankersRead;
  /** The ranking screen's filters; the block passes none. */
  filters?: RankingFilters;
  /** The New York day the recorded filter is read against (This week, Today). */
  todayKey?: string;
}): {
  debates: RecentDebate[];
  /** Every debate in the To rank window, before anything is left out: the coverage line's total. */
  windowCount: number;
  /** The filtered read stopped at its cap: the list is the first of more. */
  capped: boolean;
  rankedMatches: ToRankRankedMatches;
  isLoading: boolean;
  error: Error | null;
} {
  // Rounded to the hour so the query key, and with it the cache, holds steady between renders.
  const nowHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const filtered = Boolean(filters && hasRankingFilters(filters));
  const clauses = React.useMemo(
    () =>
      filters && filtered
        ? rankingFilterEntityClauses({ filters, window: toRankWindow(filters, todayKey, nowHour) })
        : null,
    [filtered, filters, nowHour, todayKey]
  );
  const unfilteredQuery = useQuery({
    queryKey: ['best-debates-recent-debates', TO_RANK_WINDOW_DAYS, nowHour],
    enabled: enabled && !filtered,
    staleTime: 5 * 60 * 1000,
    // From the top of the hour, so the read covers the window and `selectToRank` trims it exactly.
    queryFn: () => fetchRecentDebates(nowHour),
  });
  const filteredQuery = useQuery({
    queryKey: ['best-debates', 'to-rank-filtered', clauses] as const,
    enabled: enabled && filtered,
    staleTime: 60_000,
    queryFn: () => fetchMatchingDebates({ and: clauses ?? [] }),
  });
  const query = filtered ? filteredQuery : unfilteredQuery;

  const recent = filtered ? filteredQuery.data?.debates : unfilteredQuery.data;
  // A recorded range is exact on the server. Without one, To rank's own 7 days are read from the top
  // of the hour (as the plain read is), so they're cut to the last 7 days here either way: a debater
  // or claim filter never lists a debate the plain To rank has already dropped.
  const windowDays = filters?.recorded ? Infinity : TO_RANK_WINDOW_DAYS;
  const rankerCount = rankers.status === 'ready' ? rankers.rankerCount : undefined;
  const debates = React.useMemo(
    () => (recent ? selectToRank(recent, excludeEntityIds, Date.now(), { rankerCount, windowDays }) : []),
    [recent, excludeEntityIds, rankerCount, windowDays]
  );

  // Ranked debates aren't cut to To rank's 7 days: a recorded range still applies, through the read.
  const hasRankedIds = rankedEntityIds.length > 0 || downRankedEntityIds.length > 0;
  const rankedClauses = React.useMemo(
    () =>
      filters && filtered
        ? rankingFilterEntityClauses({
            filters,
            window: filters.recorded ? recordedRangeMs(filters.recorded, todayKey) : null,
          })
        : null,
    [filtered, filters, todayKey]
  );
  // With a recorded range the clauses are To rank's own, so this shares its read and cache.
  const rankedQuery = useQuery({
    queryKey: ['best-debates', 'to-rank-filtered', rankedClauses] as const,
    enabled: enabled && filtered && hasRankedIds,
    staleTime: 60_000,
    queryFn: () => fetchMatchingDebates({ and: rankedClauses ?? [] }),
  });
  const rankedRead = rankedQuery.data;
  const rankedMatches = React.useMemo((): ToRankRankedMatches => {
    if (!hasRankedIds) return NO_RANKED_MATCHES;
    let keep: (id: string) => boolean = () => true;
    if (filtered) {
      if (!rankedRead) return NO_RANKED_MATCHES;
      const matching = new Set(rankedRead.debates.map(debate => normId(debate.entityId)));
      keep = id => matching.has(normId(id));
    }
    const ranked = rankedEntityIds.filter(keep);
    const inRanking = new Set(rankedEntityIds.map(normId));
    // A debate placed after a down rank is ranked: it shows once, with its place.
    const downRanked = downRankedEntityIds.filter(id => !inRanking.has(normId(id)) && keep(id));
    return { ranked, downRanked, capped: filtered ? (rankedRead?.capped ?? false) : false };
  }, [downRankedEntityIds, filtered, hasRankedIds, rankedEntityIds, rankedRead]);

  const windowCount = React.useMemo(
    () => (recent ? selectToRank(recent, [], Date.now(), { windowDays }).length : 0),
    [recent, windowDays]
  );

  return {
    debates,
    windowCount,
    capped: filtered ? (filteredQuery.data?.capped ?? false) : false,
    rankedMatches,
    isLoading: enabled && query.isLoading,
    error: enabled ? (query.error ?? null) : null,
  };
}
