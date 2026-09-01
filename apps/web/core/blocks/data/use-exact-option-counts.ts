'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { type DropdownPopulation, fetchExactOptionCount } from './fetch-dropdown-options';

/**
 * Exact match counts for the dropdown options currently on screen, one
 * server-side `totalCount` per option (single relation predicate over the
 * population where — measured 0.7–4.6s each, a screenful of 25 lands in ~4s
 * at the module's concurrency cap). Results cache per (population, option)
 * for the session, so reopening a menu or re-revealing an option is free.
 *
 * Fires only for `query` populations that have NOT been fully walked: an
 * exhausted walk's tally is already exact, and an id-list (collection)
 * population would repeat its full id list in every count query — its
 * counts come from the tally instead, exact once its walk completes.
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
  const isQueryPopulation = population.kind === 'query';
  const whereKey = React.useMemo(() => JSON.stringify(population.where), [population]);

  const results = useQueries({
    queries: optionIds.map(optionId => ({
      queryKey: ['data-block', 'dropdown-option-count', columnId, whereKey, optionId],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchExactOptionCount({ columnId, optionId, where: population.where, signal }),
      enabled: enabled && isQueryPopulation,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });

  // A screenful-sized map, rebuilt per render on purpose: memoizing on the
  // per-option query results would need unstable spread deps, and consumers
  // only ever call `.get` during render.
  const counts = new Map<string, number>();
  optionIds.forEach((optionId, index) => {
    const count = results[index]?.data;
    if (count !== undefined) counts.set(optionId, count);
  });
  return counts;
}
