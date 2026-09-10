'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { ID } from '~/core/id';
import { uuidToHex } from '~/core/id/normalize';

import {
  type DropdownFacetEntry,
  type DropdownPopulation,
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

/**
 * An option row: entity id, name when known (pinned entries carry theirs),
 * exact count when known, and whether the current filters have exhausted it.
 *
 * `isExhausted` is set by {@link orderDropdownOptions} and is what the menu
 * grays out — the rule lives here rather than in the component so that what
 * sinks to the bottom of the list and what is drawn inert can never disagree.
 */
export type DropdownOption = { id: string; name: string | null; count?: number; isExhausted?: boolean };

/**
 * The menu's row order: pinned entries first (block defaults and the viewer's
 * own picks — a preset must never go missing), then the facet's own
 * count-descending order, and finally the options the current filters have
 * exhausted.
 *
 * A definite zero can only take the table to an empty view, so it sinks below
 * everything that can still narrow — the value stays listed and discoverable
 * (and countable at a glance), it just stops occupying the rows a viewer
 * reads first. Sinking is a STABLE partition: both halves keep the order they
 * were built in, so it only ever changes which half a row is in.
 *
 * A checked option never sinks however low its count, because a row the
 * viewer cannot reach is a selection they cannot undo — and in intersection
 * mode their own picks are exactly what drove the other counts to zero.
 */
export function orderDropdownOptions({
  pinned,
  entries,
  counts,
  checkedIds,
}: {
  pinned: DropdownOption[];
  entries: DropdownFacetEntry[];
  /** Null while the counts for this population are still unknown — nothing sinks yet. */
  counts: Map<string, number> | null;
  checkedIds: string[];
}): DropdownOption[] {
  const checked = new Set(checkedIds.map(uuidToHex));
  const seen = new Set<string>();
  const available: DropdownOption[] = [];
  const exhausted: DropdownOption[] = [];

  const place = (option: DropdownOption, key: string) => {
    const isExhausted = option.count === 0 && !checked.has(key);
    (isExhausted ? exhausted : available).push({ ...option, isExhausted });
  };

  for (const pin of pinned) {
    const key = uuidToHex(pin.id);
    if (seen.has(key)) continue;
    seen.add(key);
    place({ ...pin, count: counts?.get(key) ?? (counts ? 0 : undefined) }, key);
  }
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    place({ id: entry.id, name: null, count: counts ? (counts.get(entry.id) ?? 0) : undefined }, entry.id);
  }

  return exhausted.length === 0 ? available : [...available, ...exhausted];
}

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

  const options: DropdownOption[] = React.useMemo(
    // `ownSelected` is a stable reference (a stored array or the memoized
    // defaults), so this does not recompute the list on every render.
    () => orderDropdownOptions({ pinned, entries: listFacet.data ?? [], counts, checkedIds: ownSelected }),
    [pinned, listFacet.data, counts, ownSelected]
  );

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
