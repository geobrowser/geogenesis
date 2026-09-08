'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import {
  type DropdownOption,
  type DropdownPopulation,
  fetchDropdownOptionsPage,
  fingerprintIdList,
} from './fetch-dropdown-options';
import { filterStateToWhere } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';
import { type DropdownSelections, applyDropdownSelectionsToFilters } from './table-dropdown-selections';

export type { DropdownOption } from './fetch-dropdown-options';

/** Pages (× 1000 population rows) read without any user intent. */
const AUTO_WALK_PAGES = 3;

/**
 * The values of one property across the table's population, with per-option
 * counts (rows carrying the value). The population is faceted the way the
 * bounty board's filters are: the block's filter plus the OTHER dropdowns'
 * selections apply, this property's own constraint is removed, so the list
 * is never narrowed by what is currently selected here but does react to
 * the other columns.
 *
 * The walk reads the first AUTO_WALK_PAGES pages on its own; past that it
 * advances in bounded grants — reaching the end of the list or the "scan
 * more" control adds one more window, while a typed search keeps it walking
 * — so a dropdown on a huge scope cannot crawl the corpus just by sitting
 * open. Closing the menu stops the walk; reopening resumes from the cursor. "No values"/"no matches" are only ever reported once the
 * scope is exhausted — a paused walk says so instead. Selected and
 * filter-default entities are always present so a preset never goes
 * missing. The tally's per-option counts are partial sums of the scanned
 * pages: exact once the scope is exhausted, an internal lower bound before
 * that — the UI shows them only when exact, and fills the gap with
 * `useExactOptionCounts` (per-option server counts) for paused walks.
 */
export function useDropdownOptions({
  columnId,
  baseFilterState,
  baseModesByColumn,
  selections,
  facetColumnIds,
  collectionItemIds,
  pinned,
  enabled,
  searchDemand = false,
  demandGrants = 0,
}: {
  columnId: string;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  /** Personal selections; the ones on OTHER facet columns narrow this population. */
  selections: DropdownSelections;
  /** The overlay's applied columns — the facet dimensions. */
  facetColumnIds: string[];
  /** COLLECTION blocks: the ordered item ids that ARE the population; null for query sources. */
  collectionItemIds: string[] | null;
  /** Ids (with names when known) that must appear regardless of what has loaded. */
  pinned: DropdownOption[];
  enabled: boolean;
  /** A typed search wants the whole scope — continuous demand. */
  searchDemand?: boolean;
  /** One-shot intents (end of list, "scan more"); each extends the walk by one more auto window. */
  demandGrants?: number;
}) {
  const population: DropdownPopulation = React.useMemo(() => {
    const otherColumns = facetColumnIds.filter(id => !ID.equals(id, columnId));
    const overlaid = applyDropdownSelectionsToFilters(baseFilterState, baseModesByColumn, selections, otherColumns);
    const withoutColumn = overlaid.filterState.filter(f => !(ID.equals(f.columnId, columnId) && !f.isBacklink));
    const where = filterStateToWhere(withoutColumn, overlaid.modesByColumn);
    return collectionItemIds ? { kind: 'ids', ids: collectionItemIds, where } : { kind: 'query', where };
  }, [baseFilterState, baseModesByColumn, selections, facetColumnIds, columnId, collectionItemIds]);

  const populationKey = React.useMemo(
    () =>
      population.kind === 'ids'
        ? `ids:${fingerprintIdList(population.ids)}:${JSON.stringify(population.where)}`
        : `query:${JSON.stringify(population.where)}`,
    [population]
  );

  const { data, isFetching, isError, fetchNextPage, hasNextPage, refetch } = useInfiniteQuery({
    queryKey: ['data-block', 'dropdown-options', columnId, populationKey],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchDropdownOptionsPage({ propertyId: columnId, population, after: pageParam, signal }),
    getNextPageParam: lastPage => (lastPage.hasNextPage ? lastPage.endCursor : undefined),
    // The scope for a fixed population does not change mid-session, and a
    // focus refetch would replay every accumulated page of the walk serially.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const pageCount = data?.pages.length ?? 0;

  // The walk advances on its own for the first pages, then only on demand.
  // An error stops it — without the guard a failing page refires forever —
  // and `retry` resumes it.
  const targetPages = AUTO_WALK_PAGES * (1 + demandGrants);
  React.useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isError) return;
    if (pageCount >= targetPages && !searchDemand) return;
    void fetchNextPage();
  }, [enabled, hasNextPage, isFetching, isError, fetchNextPage, pageCount, targetPages, searchDemand]);

  /** Actively reading the scope now (auto window, granted windows, or a search). */
  const isWalking =
    enabled &&
    !isError &&
    (data === undefined || isFetching || (Boolean(hasNextPage) && (pageCount < targetPages || searchDemand)));

  /** More of the scope exists beyond what has been read. */
  const hasMoreInScope = Boolean(hasNextPage);

  /** The whole scope has been read: counts are exact, absences are real. */
  const scopeExhausted = enabled && !isError && data !== undefined && !hasMoreInScope && !isFetching;

  /** How many population rows the walk has checked so far. */
  const scannedCount = React.useMemo(
    () => (data?.pages ?? []).reduce((sum, page) => sum + page.populationCount, 0),
    [data]
  );

  // Pinned first, then values in arrival order (each page name-sorted) so
  // the list never reshuffles under the cursor as pages arrive. Walk pages
  // partition the population, so per-option counts add across them.
  const options: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    const add = (option: DropdownOption) => {
      const existing = byId.get(option.id);
      if (!existing) {
        byId.set(option.id, { ...option });
        return;
      }
      if (!existing.name && option.name) existing.name = option.name;
      if (option.count !== undefined) existing.count = (existing.count ?? 0) + option.count;
    };
    pinned.forEach(add);
    for (const page of data?.pages ?? []) page.options.forEach(add);
    return [...byId.values()];
  }, [data, pinned]);

  const nameOf = React.useCallback(
    (id: string) => options.find(option => ID.equals(option.id, id))?.name ?? null,
    [options]
  );

  return {
    options,
    nameOf,
    population,
    isWalking,
    hasMoreInScope,
    scopeExhausted,
    isError,
    retry: refetch,
    scannedCount,
  };
}
