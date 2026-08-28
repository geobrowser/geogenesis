'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { type DropdownOption, fetchDropdownOptionsPage } from './fetch-dropdown-options';
import { filterStateToWhere } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';

export type { DropdownOption } from './fetch-dropdown-options';

/** Upper bound on population pages walked for one dropdown (× 200 entities). */
const MAX_POPULATION_PAGES = 25;

/**
 * The values of one property across the table's population — the block's
 * filter with this property's own constraint removed, so the list is not
 * narrowed by what is currently selected. Loaded page by page on demand
 * (scrolling, or a search that has not found a match yet). Selected and
 * filter-default entities are always present so a preset never goes missing.
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

  const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['data-block', 'dropdown-options', columnId, whereKey],
    enabled,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      fetchDropdownOptionsPage({ propertyId: columnId, where, after: pageParam, signal }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasNextPage && pages.length < MAX_POPULATION_PAGES ? lastPage.endCursor : undefined,
    staleTime: 60_000,
  });

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

  return {
    options,
    nameOf,
    isLoading,
    isFetching,
    isFetchingNextPage,
    hasNextPage: Boolean(hasNextPage),
    fetchNextPage,
  };
}
