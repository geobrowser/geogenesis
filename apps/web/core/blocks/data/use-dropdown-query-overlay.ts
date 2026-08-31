'use client';

import * as React from 'react';

import { ID } from '~/core/id';
import type { Property } from '~/core/types';

import type { Filter, ModesByColumn } from './filters';
import type { Source } from './source';
import { applyDropdownSelectionsToFilters } from './table-dropdown-selections';
import { useBlockDropdowns } from './use-block-dropdowns';
import { useTableDropdownSelections } from './use-table-dropdown-selections';

/**
 * The single owner of the browse-dropdown query overlay, shared by
 * useDataBlock and Power Tools so the two surfaces can never diverge on
 * which columns apply or when.
 *
 * Invariants centralized here:
 * - Dropdowns act on the block's query; Collection and Relations sources
 *   have none, so the overlay is inert there (matching the hidden UI).
 * - `appliedColumnIds` is THE list: the overlay applies exactly these
 *   columns and the pills render exactly these columns, so a stored
 *   selection can never filter the table without a visible control.
 */
export function useDropdownQueryOverlay({
  source,
  isEditing,
  baseFilterState,
  baseModesByColumn,
  filterableProperties,
  extraPillProperties,
}: {
  source: Source;
  isEditing: boolean;
  baseFilterState: Filter[];
  baseModesByColumn: ModesByColumn;
  filterableProperties: Property[];
  /** Surface-specific additions (e.g. shown-column schema entries missing from filterableProperties). */
  extraPillProperties?: Property[];
}) {
  const { blocksRelationEntityId, dropdowns: configs, toggleDropdownProperty } = useBlockDropdowns();
  const { selections, updateSelections, hydrated } = useTableDropdownSelections(blocksRelationEntityId);

  const isQuerySource = source.type === 'SPACES' || source.type === 'GEO';

  const appliedColumnIds = React.useMemo(() => {
    const pillProperties = [...filterableProperties, ...(extraPillProperties ?? [])];
    return configs
      .map(config => config.propertyId)
      .filter(id => pillProperties.some(p => ID.equals(p.id, id) && p.dataType === 'RELATION'));
  }, [configs, filterableProperties, extraPillProperties]);

  const isActive = !isEditing && isQuerySource && hydrated && appliedColumnIds.length > 0;

  const { filterState: queryFilterState, modesByColumn: queryModesByColumn } = React.useMemo(
    () =>
      isActive
        ? applyDropdownSelectionsToFilters(baseFilterState, baseModesByColumn, selections, appliedColumnIds)
        : { filterState: baseFilterState, modesByColumn: baseModesByColumn },
    [isActive, baseFilterState, baseModesByColumn, selections, appliedColumnIds]
  );

  return {
    queryFilterState,
    queryModesByColumn,
    isActive,
    browseDropdowns: {
      configs,
      toggleDropdownProperty,
      selections,
      updateSelections,
      hydrated,
      appliedColumnIds,
      isQuerySource,
    },
  };
}
