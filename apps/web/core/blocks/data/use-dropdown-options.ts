'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import { type DropdownOption, fetchDropdownOptions } from './fetch-dropdown-options';
import { filterStateToWhere } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';

export type { DropdownOption } from './fetch-dropdown-options';

/**
 * Candidate values for one browse-mode dropdown: the to-entities that occur
 * for `columnId` across the table's population — the block's filter with this
 * property's own constraint removed, so the list is not narrowed by what is
 * currently selected. Built with the same where/filter transformers the table
 * query uses. Entities that are selected or are the filter's defaults are
 * always merged in, so a preset is never missing from its own dropdown.
 */
export function useDropdownOptions({
  columnId,
  baseFilterState,
  baseModesByColumn,
  pinned,
}: {
  columnId: string;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  /** Ids (with names when known) that must appear regardless of the fetch window. */
  pinned: DropdownOption[];
}) {
  const where = React.useMemo(() => {
    const withoutColumn = baseFilterState.filter(f => !(ID.equals(f.columnId, columnId) && !f.isBacklink));
    return filterStateToWhere(withoutColumn, baseModesByColumn);
  }, [baseFilterState, baseModesByColumn, columnId]);

  const whereKey = React.useMemo(() => JSON.stringify(where), [where]);

  const { data: fetched = [], isLoading } = useQuery({
    queryKey: ['data-block', 'dropdown-options', columnId, whereKey],
    queryFn: ({ signal }) => fetchDropdownOptions({ propertyId: columnId, where, signal }),
    staleTime: 60_000,
  });

  const options: DropdownOption[] = React.useMemo(() => {
    const byId = new Map<string, DropdownOption>();
    for (const option of fetched) byId.set(option.id, option);
    for (const pin of pinned) {
      const existing = byId.get(pin.id);
      if (!existing || (!existing.name && pin.name)) byId.set(pin.id, pin);
    }
    return [...byId.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [fetched, pinned]);

  const nameOf = React.useCallback(
    (id: string) => options.find(option => ID.equals(option.id, id))?.name ?? null,
    [options]
  );

  return { options, nameOf, isLoading };
}
