'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';

import {
  type DropdownFacetEntry,
  type DropdownPopulation,
  dropdownIdKey,
  fetchDropdownFacet,
  fingerprintIdList,
} from './fetch-dropdown-options';
import { filterStateToWhere, isBacklinkFilter } from './filter-state-to-where';
import type { Filter, ModesByColumn } from './filters';
import {
  type DropdownSelectionModes,
  type DropdownSelections,
  applyDropdownSelectionsToFilters,
  effectiveDropdownMode,
  effectiveDropdownSelection,
  filterDefaultsForColumn,
} from './table-dropdown-selections';

/** An option row: entity id, name when known (pinned entries carry theirs), exact count when known. */
export type DropdownOption = { id: string; name: string | null; count?: number };

function populationKeyOf(population: DropdownPopulation): string {
  return population.kind === 'ids'
    ? `ids:${fingerprintIdList(population.ids)}:${JSON.stringify(population.where)}`
    : `query:${JSON.stringify(population.where)}`;
}

/**
 * The values of one property across the table's population, with exact
 * counts — ONE grouped-aggregation request returns the entire option list
 * (see fetch-dropdown-options.ts for the measurements). Options come
 * count-descending; pinned entries (block defaults and the viewer's checked
 * options) always lead so a preset never goes missing.
 *
 * The population is faceted: the block's filter plus the OTHER dropdowns'
 * selections apply, this property's own constraint is removed. In
 * intersection ('All') mode with picks, a SECOND facet over the
 * own-picks-included population supplies the displayed counts — the option
 * list still enumerates from the unconstrained facet, so incompatible
 * options gray out at 0 rather than vanish.
 */
export function useDropdownOptions({
  columnId,
  baseFilterState,
  baseModesByColumn,
  selections,
  selectionModes,
  facetColumnIds,
  collectionItemIds,
  pinned,
  enabled,
}: {
  columnId: string;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  /** Personal selections; the ones on OTHER facet columns narrow this population. */
  selections: DropdownSelections;
  /** Per-dropdown combinators — other columns' modes shape populations like their selections do. */
  selectionModes: DropdownSelectionModes;
  /** The overlay's applied columns — the facet dimensions. */
  facetColumnIds: string[];
  /** COLLECTION blocks: the ordered item ids that ARE the population; null for query sources. */
  collectionItemIds: string[] | null;
  /** Ids (with names when known) that must appear regardless of what the facet returns. */
  pinned: DropdownOption[];
  enabled: boolean;
}) {
  // The hook is the single source of truth for this dropdown's combinator
  // and both populations — a caller cannot desynchronize what the radio
  // shows from what the queries do.
  const filterDefaults = React.useMemo(
    () => filterDefaultsForColumn(baseFilterState, columnId),
    [baseFilterState, columnId]
  );
  const ownMode = effectiveDropdownMode(selectionModes, columnId, filterDefaults, baseModesByColumn);
  const ownSelected = effectiveDropdownSelection(selections, columnId, filterDefaults);

  const buildPopulation = React.useCallback(
    (appliedColumns: string[], stripOwnForward: boolean): DropdownPopulation => {
      const overlaid = applyDropdownSelectionsToFilters(
        baseFilterState,
        baseModesByColumn,
        selections,
        appliedColumns,
        selectionModes
      );
      const filters = stripOwnForward
        ? overlaid.filterState.filter(f => !(ID.equals(f.columnId, columnId) && !isBacklinkFilter(f)))
        : overlaid.filterState;
      const where = filterStateToWhere(filters, overlaid.modesByColumn);
      return collectionItemIds ? { kind: 'ids', ids: collectionItemIds, where } : { kind: 'query', where };
    },
    [baseFilterState, baseModesByColumn, selections, selectionModes, columnId, collectionItemIds]
  );

  const population: DropdownPopulation = React.useMemo(
    () =>
      buildPopulation(
        facetColumnIds.filter(id => !ID.equals(id, columnId)),
        true
      ),
    [buildPopulation, facetColumnIds, columnId]
  );

  /** Own picks constrain the displayed counts (intersection semantics). */
  const countsDiverge = ownMode === 'AND' && ownSelected.length > 0;

  const countPopulation: DropdownPopulation = React.useMemo(
    () => (countsDiverge ? buildPopulation(facetColumnIds, false) : population),
    [countsDiverge, buildPopulation, facetColumnIds, population]
  );

  const listKey = React.useMemo(() => populationKeyOf(population), [population]);
  const countKey = React.useMemo(() => populationKeyOf(countPopulation), [countPopulation]);

  const listFacet = useQuery({
    queryKey: ['data-block', 'dropdown-facet', columnId, listKey],
    enabled,
    queryFn: ({ signal }) => fetchDropdownFacet({ columnId, population, signal }),
    // A facet for a fixed population does not change mid-session; keep the
    // previous list on screen while another dropdown's toggle re-keys it.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // No placeholder here: a previous population's counts must never render as
  // definite numbers, so while this facet re-resolves the counts read as
  // pending (skeleton badges) instead.
  const countFacet = useQuery({
    queryKey: ['data-block', 'dropdown-facet', columnId, countKey],
    enabled: enabled && countsDiverge,
    queryFn: ({ signal }) => fetchDropdownFacet({ columnId, population: countPopulation, signal }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const counts = React.useMemo(() => {
    // Same honesty rule for the list facet: its kept-previous list stays on
    // screen while re-keying, but its stale counts do not.
    const source: DropdownFacetEntry[] | undefined = countsDiverge
      ? countFacet.data
      : listFacet.isPlaceholderData
        ? undefined
        : listFacet.data;
    if (!source) return null;
    return new Map(source.map(entry => [entry.id, entry.count]));
  }, [countsDiverge, countFacet.data, listFacet.data, listFacet.isPlaceholderData]);

  // Pinned first (dedup by canonical id form), then the facet count-descending.
  const options: DropdownOption[] = React.useMemo(() => {
    const seen = new Set<string>();
    const out: DropdownOption[] = [];
    for (const pin of pinned) {
      const key = dropdownIdKey(pin.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...pin, count: counts?.get(key) ?? (counts ? 0 : undefined) });
    }
    for (const entry of listFacet.data ?? []) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ id: entry.id, name: null, count: counts ? (counts.get(entry.id) ?? 0) : undefined });
    }
    return out;
  }, [pinned, listFacet.data, counts]);

  return {
    options,
    ownMode,
    countsDiverge,
    /** The list itself is loading (first facet for this population). */
    isLoading: enabled && listFacet.isLoading,
    /** Counts are unknown right now: the All-mode facet or a re-keyed list facet is still resolving. */
    countsPending:
      enabled &&
      counts === null &&
      !(countsDiverge ? countFacet.isError : listFacet.isError) &&
      (countsDiverge || listFacet.data !== undefined),
    isError: listFacet.isError || (countsDiverge && countFacet.isError),
    retry: () => {
      if (listFacet.isError) void listFacet.refetch();
      if (countFacet.isError) void countFacet.refetch();
    },
  };
}
