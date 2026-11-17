'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { capture } from '~/core/analytics';
import {
  BEST_DEBATES_CLAIM_PARAM,
  BEST_DEBATES_DEBATERS_PARAM,
  BEST_DEBATES_RECORDED_PARAM,
  type RankingFilters,
  readRankingFilters,
  writeRankingFilters,
} from '~/core/blocks/ranking/best-debates-ranking-filters';
import { BEST_DEBATES_TEAM_VIEW_PARAM, BEST_DEBATES_TEAM_VIEW_TO_RANK } from '~/core/blocks/ranking/best-debates-views';

/** Which filter a change came from, for its analytics event. */
export type RankingFilterElement = 'recorded_filter' | 'debater_filter' | 'claim_filter' | 'clear_filters';

export type BestDebatesRankingFilterState = {
  filters: RankingFilters;
  setFilters: (next: RankingFilters, element: RankingFilterElement) => void;
};

/**
 * Rewrites the page's query string in place: same path, same history entry and its state (the leave
 * guard keeps a sentinel there). Read from `window.location` at the moment of writing, never a
 * render's stale copy.
 *
 * Next's marker keys (`__NA`, `_N`) are taken off the state passed in: Next's patched
 * `replaceState` treats a state carrying them as its own write and skips syncing its router, so
 * `useSearchParams` would never see the change (and Next's next history write would put the old
 * URL back). Next copies its markers back onto the entry itself.
 */
export function replaceSearchParams(update: (params: URLSearchParams) => URLSearchParams) {
  if (typeof window === 'undefined') return;
  const next = update(new URLSearchParams(window.location.search));
  const search = next.toString();
  const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
  window.history.replaceState(withoutNextMarkers(window.history.state), '', url);
}

function withoutNextMarkers(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object') return null;
  const { __NA, _N, ...rest } = state as Record<string, unknown>;
  return rest;
}

/** Writes `?team=to-rank` while To rank is open, so a reload or a shared link opens on it too. */
export function writeTeamViewParam(toRank: boolean) {
  replaceSearchParams(params => {
    const next = new URLSearchParams(params);
    if (toRank) next.set(BEST_DEBATES_TEAM_VIEW_PARAM, BEST_DEBATES_TEAM_VIEW_TO_RANK);
    else next.delete(BEST_DEBATES_TEAM_VIEW_PARAM);
    return next;
  });
}

/**
 * The ranking screen's recorded, debater and claim filters (GEO-3774). The URL is their only home:
 * read from `useSearchParams`, written with `replaceSearchParams`, so a reload or a shared link opens
 * on the same filters and nothing mirrors them in state that could drift.
 */
export function useBestDebatesRankingFilters({
  blockId,
  spaceId,
}: {
  blockId: string;
  spaceId: string;
}): BestDebatesRankingFilterState {
  const searchParams = useSearchParams();
  const recorded = searchParams?.get(BEST_DEBATES_RECORDED_PARAM) ?? null;
  const debaters = searchParams?.get(BEST_DEBATES_DEBATERS_PARAM) ?? null;
  const claim = searchParams?.get(BEST_DEBATES_CLAIM_PARAM) ?? null;

  const filters = React.useMemo(
    () =>
      readRankingFilters({
        get: name =>
          name === BEST_DEBATES_RECORDED_PARAM
            ? recorded
            : name === BEST_DEBATES_DEBATERS_PARAM
              ? debaters
              : name === BEST_DEBATES_CLAIM_PARAM
                ? claim
                : null,
      }),
    [recorded, debaters, claim]
  );

  const setFilters = React.useCallback(
    (next: RankingFilters, element: RankingFilterElement) => {
      capture('element_changed', {
        source: 'best_debates_ranking',
        element,
        value: writeRankingFilters(new URLSearchParams(), next).toString() || 'none',
        previous_value: writeRankingFilters(new URLSearchParams(), filters).toString() || 'none',
        block_id: blockId,
        space_id: spaceId,
      });
      replaceSearchParams(params => writeRankingFilters(params, next));
    },
    [blockId, filters, spaceId]
  );

  return React.useMemo(() => ({ filters, setFilters }), [filters, setFilters]);
}
