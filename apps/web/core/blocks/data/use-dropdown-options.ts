'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { type DropdownOption, fetchDropdownOptionsPage } from './fetch-dropdown-options';
import { filterStateToWhere } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';

export type { DropdownOption } from './fetch-dropdown-options';

/**
 * The values of one property across the table's population — the block's
 * filter with this property's own constraint removed, so the list is not
 * narrowed by what is currently selected. While the dropdown is open the
 * population is walked page by page until the scope is exhausted; closing
 * the menu stops the walk and reopening resumes from the cursor. There is
 * deliberately no page cap: cost is bounded by how long a person holds the
 * menu open, and "no values"/"no matches" are only ever reported after the
 * whole scope was checked. Selected and filter-default entities are always
 * present so a preset never goes missing.
 */
export function useDropdownOptions({
  columnId,
  baseFilterState,
  baseModesByColumn,
  pinned,
  enabled,
}: {
  columnId: string;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  /** Ids (with names when known) that must appear regardless of what has loaded. */
  pinned: DropdownOption[];
  enabled: boolean;
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
    staleTime: 60_000,
  });

  // The walk advances on its own while enabled. An error stops it — without
  // the guard a failing page refires forever — and `retry` resumes it.
  React.useEffect(() => {
    if (!enabled || !hasNextPage || isFetching || isError) return;
    void fetchNextPage();
  }, [enabled, hasNextPage, isFetching, isError, fetchNextPage]);

  /** True from the moment a walk is requested until the scope is exhausted. */
  const isWalking = enabled && !isError && (data === undefined || isFetching || Boolean(hasNextPage));

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

  return { options, nameOf, isWalking, isError, retry: refetch, scannedCount };
}
