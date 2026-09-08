'use client';

import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Property } from '~/core/types';

import type { Filter, ModesByColumn } from './filters';
import type { Source } from './source';
import { applyDropdownSelectionsToFilters } from './table-dropdown-selections';
import { useBlockDropdowns } from './use-block-dropdowns';
import { useCollectionMemberSchema } from './use-collection-member-schema';
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
  const {
    selections,
    modes: selectionModes,
    updateSelections,
    setColumnMode,
    hydrated,
  } = useTableDropdownSelections(blocksRelationEntityId);

  const supportsDropdowns = sourceSupportsDropdowns(source);

  // COLLECTION populations are the block's enumerated item ids. Read them
  // here — the one place both surfaces share — so the options walk and the
  // row filter can never disagree about membership. Mirrors useCollection's
  // own enumeration (dedupe by target, Position order).
  const { entityId, spaceId } = useDataBlockInstance();
  const { initialBlockEntities } = useEditorStoreLite();
  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
    enabled: source.type === 'COLLECTION',
  });
  // Same membership source as useCollection: the queried entity, else the
  // SSR-provided initial block entity while hydration is in flight. While
  // NEITHER is available the ids are null — "unknown", never "empty", so a
  // hydrating collection can't present the definitive empty state.
  const effectiveBlockEntity =
    source.type === 'COLLECTION' ? (blockEntity ?? initialBlockEntities.find(b => b.id === entityId) ?? null) : null;
  const collectionItemIds = React.useMemo(() => {
    if (source.type !== 'COLLECTION' || !effectiveBlockEntity) return null;
    const seen = new Set<string>();
    return effectiveBlockEntity.relations
      .filter(r => r.fromEntity.id === source.value && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE)
      .sort((a, z) => Position.compare(a.position ?? null, z.position ?? null))
      .map(r => r.toEntity.id)
      .filter(id => (seen.has(id) ? false : (seen.add(id), true)));
  }, [source, effectiveBlockEntity]);
  /** COLLECTION membership readable yet? Until then the population is unknown, not empty. */
  const populationReady = source.type !== 'COLLECTION' || collectionItemIds !== null;

  // Collections derive their schema from the members (a collection has no
  // type predicate for the filter-driven derivation to read). Shared here so
  // the eye menu, the dropdown picker, and the overlay's gate all see it.
  const collectionMemberProperties = useCollectionMemberSchema(collectionItemIds);

  // Dropdown ELIGIBILITY is scoped to the table's own spaces — a deliberate,
  // dropdown-only divergence from the graph-wide schema union (GEO-2202)
  // that feeds the column/sort/filter menus. The union lets ANY space graft
  // a same-named twin property onto a shared type and have it surface in
  // every picker in the graph; a table's dropdowns should only offer
  // properties the table's selected spaces (or its own space) actually
  // declare. GEO tables scope to the whole graph by definition and
  // COLLECTION schemas already derive from the members, so only SPACES
  // sources are restricted.
  const typesInFilter = React.useMemo(
    () => baseFilterState.filter(f => ID.equals(f.columnId, SystemIds.TYPES_PROPERTY)).map(f => f.value),
    [baseFilterState]
  );
  const tableSpaceIds = React.useMemo(() => {
    const ids = baseFilterState.filter(f => ID.equals(f.columnId, SystemIds.SPACE_FILTER)).map(f => f.value);
    if (spaceId && !ids.some(id => ID.equals(id, spaceId))) ids.push(spaceId);
    return ids;
  }, [baseFilterState, spaceId]);
  const restrictToTableSpaces = source.type === 'SPACES';
  const { data: tableSpaceSchema } = useQuery({
    enabled: restrictToTableSpaces && typesInFilter.length > 0 && tableSpaceIds.length > 0,
    queryKey: ['data-block', 'dropdown-eligible-schema', [...typesInFilter].sort(), [...tableSpaceIds].sort()],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      // The type entities' schema relations read ONLY from the table's
      // spaces: the spaceId hint scopes the native fetch and the second
      // argument adds each selected space; includeAllTypeSpaces stays off.
      getSchemaFromTypeIds(
        typesInFilter.map(id => ({ id, spaceId: tableSpaceIds[0] })),
        tableSpaceIds,
        { includeAllTypeSpaces: false }
      ),
  });
  /** Relation property ids declared by the table's spaces; null = unrestricted (GEO/COLLECTION, or loading). */
  const dropdownEligibleIds = React.useMemo(() => {
    if (!restrictToTableSpaces || !tableSpaceSchema) return null;
    return tableSpaceSchema.filter(property => property.dataType === 'RELATION').map(property => property.id);
  }, [restrictToTableSpaces, tableSpaceSchema]);

  const appliedColumnIds = React.useMemo(() => {
    const pillProperties = [...filterableProperties, ...(extraPillProperties ?? []), ...collectionMemberProperties];
    return configs
      .map(config => config.propertyId)
      .filter(id => pillProperties.some(p => ID.equals(p.id, id) && p.dataType === 'RELATION'))
      .filter(id => dropdownEligibleIds === null || dropdownEligibleIds.some(e => ID.equals(e, id)));
  }, [configs, filterableProperties, extraPillProperties, collectionMemberProperties, dropdownEligibleIds]);

  const isActive = !isEditing && supportsDropdowns && hydrated && appliedColumnIds.length > 0;

  const { filterState: queryFilterState, modesByColumn: queryModesByColumn } = React.useMemo(
    () =>
      isActive
        ? applyDropdownSelectionsToFilters(
            baseFilterState,
            baseModesByColumn,
            selections,
            appliedColumnIds,
            selectionModes
          )
        : { filterState: baseFilterState, modesByColumn: baseModesByColumn },
    [isActive, baseFilterState, baseModesByColumn, selections, appliedColumnIds, selectionModes]
  );

  return {
    queryFilterState,
    queryModesByColumn,
    isActive,
    browseDropdowns: {
      configs,
      toggleDropdownProperty,
      selections,
      selectionModes,
      updateSelections,
      setColumnMode,
      hydrated,
      appliedColumnIds,
      supportsDropdowns,
      collectionItemIds,
      populationReady,
      collectionMemberProperties,
      dropdownEligibleIds,
    },
  };
}
