'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { ID } from '~/core/id';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Property } from '~/core/types';

import type { Filter, ModesByColumn } from './filters';
import type { Source } from './source';
import { applyDropdownSelectionsToFilters } from './table-dropdown-selections';
import { useBlockDropdowns } from './use-block-dropdowns';
import { useDataBlockInstance } from './use-data-block';
import { useTableDropdownSelections } from './use-table-dropdown-selections';

/**
 * Sources whose rows can carry a personal dropdown filter. SPACES/GEO rows
 * come from the block's query and COLLECTION rows flow through the same
 * where (useCollection filters its enumerated ids by it), so the overlay
 * mechanism is identical. RELATIONS is out: its rows are selector
 * projections of a single entity, not entities matched by predicates.
 */
export function sourceSupportsDropdowns(source: Source): boolean {
  return source.type === 'SPACES' || source.type === 'GEO' || source.type === 'COLLECTION';
}

/**
 * The single owner of the browse-dropdown query overlay, shared by
 * useDataBlock and Power Tools so the two surfaces can never diverge on
 * which columns apply or when.
 *
 * Invariants centralized here:
 * - Dropdowns act on the block's population; Relations sources have none,
 *   so the overlay is inert there (matching the hidden UI).
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

  const supportsDropdowns = sourceSupportsDropdowns(source);

  // COLLECTION populations are the block's enumerated item ids. Read them
  // here — the one place both surfaces share — so the options walk and the
  // row filter can never disagree about membership. Mirrors useCollection's
  // own enumeration (dedupe by target, Position order).
  const { entityId, spaceId } = useDataBlockInstance();
  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: source.type === 'COLLECTION',
  });
  const collectionItemIds = React.useMemo(() => {
    if (source.type !== 'COLLECTION' || !blockEntity) return source.type === 'COLLECTION' ? [] : null;
    const seen = new Set<string>();
    return blockEntity.relations
      .filter(r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE)
      .sort((a, z) => Position.compare(a.position ?? null, z.position ?? null))
      .map(r => r.toEntity.id)
      .filter(id => (seen.has(id) ? false : (seen.add(id), true)));
  }, [source, blockEntity]);

  const appliedColumnIds = React.useMemo(() => {
    const pillProperties = [...filterableProperties, ...(extraPillProperties ?? [])];
    return configs
      .map(config => config.propertyId)
      .filter(id => pillProperties.some(p => ID.equals(p.id, id) && p.dataType === 'RELATION'));
  }, [configs, filterableProperties, extraPillProperties]);

  const isActive = !isEditing && supportsDropdowns && hydrated && appliedColumnIds.length > 0;

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
      supportsDropdowns,
      collectionItemIds,
    },
  };
}
