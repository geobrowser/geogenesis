'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import {
  type DropdownPopulation,
  MAX_COUNTABLE_ID_LIST,
  fetchExactOptionCount,
  fetchPopulationTotal,
  fingerprintIdList,
} from './fetch-dropdown-options';

/**
 * Exact match counts for the dropdown options currently on screen, one
 * server-side `totalCount` per option (single relation predicate over the
 * population where — measured 0.7–4.6s each, a screenful of 25 lands in ~4s
 * at the module's concurrency cap). Results cache per (population, option)
 * for the session, so reopening a menu or re-revealing an option is free.
 *
 * Fires when the walk's tally cannot serve: an unexhausted query walk, or
 * any population whose count semantics diverge from the walk (intersection
 * mode). Two cost controls beyond caching:
 * - the population is DEBOUNCED briefly, so rapid checkbox toggles or
 *   Any/All flips dispatch one wave, not one per change;
 * - in intersection mode every already-checked option's count equals the
 *   population's own total (its predicate is implied by the picks), so the
 *   checked set shares ONE query instead of k identical expensive ones.
 *
 * Id-list (collection) populations are countable up to
 * MAX_COUNTABLE_ID_LIST members — each count query embeds the whole list,
 * so bigger collections show no badges rather than shipping megabytes.
 */
export function useExactOptionCounts({
  columnId,
  population,
  optionIds,
  checkedIds = [],
  enabled,
}: {
  columnId: string;
  population: DropdownPopulation;
  /** The revealed options — count queries fire for exactly these. */
  optionIds: string[];
  /** Options whose predicate is already implied by the population (intersection mode picks). */
  checkedIds?: string[];
  enabled: boolean;
}) {
  const populationCountable = population.kind === 'query' || population.ids.length <= MAX_COUNTABLE_ID_LIST;
  const populationKey = React.useMemo(
    () =>
      population.kind === 'ids'
        ? `ids:${fingerprintIdList(population.ids)}:${JSON.stringify(population.where)}`
        : JSON.stringify(population.where),
    [population]
  );

  // Debounce population changes: every checkbox toggle or Any/All flip
  // re-keys all revealed options, and without this each change dispatched a
  // fresh wave of queries mid-interaction.
  const populationRef = React.useRef(population);
  populationRef.current = population;
  const [active, setActive] = React.useState({ population, key: populationKey });
  React.useEffect(() => {
    if (active.key === populationKey) return;
    const timeout = setTimeout(() => setActive({ population: populationRef.current, key: populationKey }), 250);
    return () => clearTimeout(timeout);
  }, [populationKey, active.key]);

  const countable = enabled && populationCountable;
  const uncheckedIds = optionIds.filter(id => !checkedIds.some(checked => ID.equals(checked, id)));

  const { data: populationTotal, isLoading: totalLoading } = useQuery({
    queryKey: ['data-block', 'dropdown-population-total', columnId, active.key],
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchPopulationTotal({ population: active.population, signal }),
    enabled: countable && checkedIds.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const results = useQueries({
    queries: uncheckedIds.map(optionId => ({
      queryKey: ['data-block', 'dropdown-option-count', columnId, active.key, optionId],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchExactOptionCount({ columnId, optionId, population: active.population, signal }),
      enabled: countable,
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
  uncheckedIds.forEach((optionId, index) => {
    const result = results[index];
    if (result?.data !== undefined) counts.set(optionId, result.data);
    else if (result?.isLoading) pendingIds.add(optionId);
  });
  for (const optionId of optionIds) {
    if (!checkedIds.some(checked => ID.equals(checked, optionId))) continue;
    if (populationTotal !== undefined) counts.set(optionId, populationTotal);
    else if (totalLoading) pendingIds.add(optionId);
  }
  return { counts, pendingIds };
}
