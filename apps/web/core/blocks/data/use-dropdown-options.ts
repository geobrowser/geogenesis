'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { type DropdownOption, fetchDropdownOptionsPage } from './fetch-dropdown-options';
import { filterStateToWhere } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';

export type { DropdownOption } from './fetch-dropdown-options';

/** Pages (× 1000 population rows) read without any user intent. */
const AUTO_WALK_PAGES = 3;

/**
 * The values of one property across the table's population — the block's
 * filter with this property's own constraint removed, so the list is not
 * narrowed by what is currently selected. The walk reads the first
 * AUTO_WALK_PAGES pages on its own; past that it advances only on demand
 * (the user scrolling to the end of the list, or a typed search), so a
 * dropdown on a huge scope cannot crawl the corpus just by sitting open.
 * Closing the menu stops the walk; reopening resumes from the cursor.
 * "No values"/"no matches" are only ever reported once the scope is
 * exhausted — a paused walk says so instead. Selected and filter-default
 * entities are always present so a preset never goes missing.
 */
export function useDropdownOptions({
  columnId,
  baseFilterState,
  baseModesByColumn,
  pinned,
  enabled,
  demand = false,
}: {
  columnId: string;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  /** Ids (with names when known) that must appear regardless of what has loaded. */
  pinned: DropdownOption[];
  enabled: boolean;
  /** User intent to read past the auto-walk window: scrolled to the end, or searching. */
  demand?: boolean;
}) {
  const where = React.useMemo(() => {
    const withoutColumn = baseFilterState.filter(f => !(ID.equals(f.columnId, columnId) && !f.isBacklink));
    return filterStateToWhere(withoutColumn, baseModesByColumn);
  }, [baseFilterState, baseModesByColumn, columnId]);

  const whereKey = React.useMemo(() => JSON.stringify(where), [where]);

  const { data, isFetching, isError, fetchNextPage, hasNextPage, refetch } = useInfiniteQuery({
    queryKey: ['data-block', 'dropdown-options', columnId, whereKey],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchDropdownOptionsPage({ propertyId: columnId, where, after: pageParam, signal }),
    getNextPageParam: lastPage => (lastPage.hasNextPage ? lastPage.endCursor : undefined),
    // The scope for a fixed where does not change mid-session, and a focus
    // refetch would replay every accumulated page of the walk serially.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const pageCount = data?.pages.length ?? 0;

  // The walk advances on its own for the first pages, then only on demand.
  // An error stops it — without the guard a failing page refires forever —
  // and `retry` resumes it.
  React.useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isError) return;
    if (pageCount >= AUTO_WALK_PAGES && !demand) return;
    void fetchNextPage();
  }, [enabled, hasNextPage, isFetching, isError, fetchNextPage, pageCount, demand]);

  /** Actively reading the scope now (auto window, or demand-driven). */
  const isWalking =
    enabled &&
    !isError &&
    (data === undefined || isFetching || (Boolean(hasNextPage) && (pageCount < AUTO_WALK_PAGES || demand)));

  /** More of the scope exists beyond what has been read. */
  const hasMoreInScope = Boolean(hasNextPage);

  /** How many population rows the walk has checked so far. */
  const scannedCount = React.useMemo(
    () => (data?.pages ?? []).reduce((sum, page) => sum + page.populationCount, 0),
    [data]
  );

  // Pinned first, then values in arrival order (each page name-sorted) so
  // the list never reshuffles under the cursor as pages arrive.
  const options: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    const add = (option: DropdownOption) => {
      const existing = byId.get(option.id);
      if (!existing) byId.set(option.id, option);
      else if (!existing.name && option.name) byId.set(option.id, { ...existing, name: option.name });
    };
    pinned.forEach(add);
    for (const page of data?.pages ?? []) page.options.forEach(add);
    return [...byId.values()];
  }, [data, pinned]);

  const nameOf = React.useCallback(
    (id: string) => options.find(option => ID.equals(option.id, id))?.name ?? null,
    [options]
  );

  return { options, nameOf, isWalking, hasMoreInScope, isError, retry: refetch, scannedCount };
}
