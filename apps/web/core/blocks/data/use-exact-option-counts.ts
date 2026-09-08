'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { type DropdownPopulation, fetchExactOptionCount, fingerprintIdList } from './fetch-dropdown-options';

/**
 * Exact match counts for the dropdown options currently on screen, one
 * server-side `totalCount` per option (single relation predicate over the
 * population where — measured 0.7–4.6s each, a screenful of 25 lands in ~4s
 * at the module's concurrency cap). Results cache per (population, option)
 * for the session, so reopening a menu or re-revealing an option is free.
 *
 * Fires when the walk's tally cannot serve: an unexhausted query walk, or
 * any population whose count semantics diverge from the walk (intersection
 * mode). Id-list (collection) populations are countable up to 1,000 members
 * — beyond that each count query would repeat a huge id list, so they fall
 * back to the tally.
 */
export function useExactOptionCounts({
  columnId,
  population,
  optionIds,
  enabled,
}: {
  columnId: string;
  population: DropdownPopulation;
  /** The revealed options — count queries fire for exactly these. */
  optionIds: string[];
  enabled: boolean;
}) {
  // Id-list (collection) populations are countable too, but every count
  // query repeats the id list — cap it so a giant collection cannot ship
  // megabytes per badge.
  const populationCountable = population.kind === 'query' || population.ids.length <= 1000;
  const populationKey = React.useMemo(
    () =>
      population.kind === 'ids'
        ? `ids:${fingerprintIdList(population.ids)}:${JSON.stringify(population.where)}`
        : JSON.stringify(population.where),
    [population]
  );

  const results = useQueries({
    queries: optionIds.map(optionId => ({
      queryKey: ['data-block', 'dropdown-option-count', columnId, populationKey, optionId],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchExactOptionCount({ columnId, optionId, population, signal }),
      enabled: enabled && populationCountable,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });

  // Screenful-sized structures, rebuilt per render on purpose: memoizing on
  // the per-option query results would need unstable spread deps, and
  // consumers only read them during render. `pendingIds` marks options whose
  // count query is genuinely in flight (never a disabled or settled one), so
  // the UI can reserve the badge slot without pulsing forever where no count
  // is coming.
  const counts = new Map<string, number>();
  const pendingIds = new Set<string>();
  optionIds.forEach((optionId, index) => {
    const result = results[index];
    if (result?.data !== undefined) counts.set(optionId, result.data);
    else if (result?.isLoading) pendingIds.add(optionId);
  });
  return { counts, pendingIds };
}
