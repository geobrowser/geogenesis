import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reactiveRelations } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { useValues } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import { mergeRelationValueTypesFromStore } from '~/core/utils/property/properties';

import {
  Filter,
  FilterMode,
  ModesByColumn,
  parseFiltersSync,
  resolveFilterDisplayNames,
  toGeoFilterState,
} from './filters';
import { useDataBlockInstance } from './use-data-block';

export function useFilters(canEdit?: boolean) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = React.useMemo(
    () => initialBlockEntities.find(b => b.id === entityId) ?? null,
    [initialBlockEntities, entityId]
  );

  const localFilterValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === SystemIds.FILTER && v.spaceId === spaceId,
  });

  const filterTriple =
    localFilterValues[0] ??
    initialBlockEntity?.values.find(v => v.property.id === SystemIds.FILTER && v.spaceId === spaceId) ??
    null;

  const geoFilterString = React.useMemo(() => {
    if (!filterTriple) return null;

    if (filterTriple.property.dataType === 'TEXT') {
      if (filterTriple.value === '') return null;
      return filterTriple.value;
    }

    return null;
  }, [filterTriple]);

  const { filters: filterState, modesByColumn } = React.useMemo(
    () => parseFiltersSync(geoFilterString),
    [geoFilterString]
  );

  const { data: resolvedFilterState, isPlaceholderData } = useQuery({
    enabled: filterState.length > 0,
    placeholderData: keepPreviousData,
    queryKey: ['blocks', 'data', 'filter-display-names', geoFilterString],
    queryFn: () => resolveFilterDisplayNames(filterState),
  });

  const { data: schemaProperties } = useQuery({
    enabled: true,
    queryKey: ['blocks', 'data', 'filterable-properties', geoFilterString, spaceId],
    queryFn: async () => {
      const typesInFilter = filterState.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => f.value);
      const spacesInFilter = filterState.filter(f => f.columnId === SystemIds.SPACE_FILTER).map(f => f.value);
      if (!spacesInFilter.includes(spaceId)) spacesInFilter.push(spaceId);
      return await getSchemaFromTypeIds(
        typesInFilter.map(id => ({ id })),
        spacesInFilter
      );
    },
  });

  const relationsSnapshot = useSelector(reactiveRelations, r => r, equal);

  const filterableProperties = React.useMemo(() => {
    const base = schemaProperties ?? [];
    return base.map(p => mergeRelationValueTypesFromStore(p, store));
  }, [schemaProperties, relationsSnapshot]);

  // When the query key changes, keepPreviousData returns stale resolved filters from the old key.
  // Fall back to the freshly-parsed filterState until the new resolution completes.
  const freshResolvedState = isPlaceholderData ? undefined : resolvedFilterState;
  const isFilterResolving = filterState.length > 0 && freshResolvedState === undefined;
  const effectiveResolvedState = filterState.length === 0 ? [] : (freshResolvedState ?? filterState);

  const [temporaryFilterOverride, setTemporaryFilterOverride] = React.useState<Filter[] | null>(null);
  const [temporaryModesOverride, setTemporaryModesOverride] = React.useState<ModesByColumn | null>(null);

  const temporaryFilters = temporaryFilterOverride ?? effectiveResolvedState;
  const temporaryModesByColumn: ModesByColumn = temporaryModesOverride ?? modesByColumn;

  const setTemporaryFilters = React.useCallback((filters: Filter[]) => {
    setTemporaryFilterOverride(filters);
  }, []);

  const setTemporaryGroupMode = React.useCallback((columnId: string, mode: FilterMode) => {
    setTemporaryModesOverride(prev => ({ ...(prev ?? {}), [columnId]: mode }));
  }, []);

  React.useEffect(() => {
    if (canEdit === true) {
      setTemporaryFilterOverride(null);
      setTemporaryModesOverride(null);
    }
  }, [canEdit]);

  const modesByColumnRef = React.useRef(modesByColumn);
  React.useEffect(() => {
    modesByColumnRef.current = modesByColumn;
  }, [modesByColumn]);

  const filterStateRef = React.useRef(filterState);
  React.useEffect(() => {
    filterStateRef.current = filterState;
  }, [filterState]);

  const writeFilterTriple = React.useCallback(
    (filters: Filter[], modes: ModesByColumn) => {
      const newFiltersString =
        filters.length === 0 && Object.keys(modes).length === 0 ? '' : toGeoFilterState(filters, modes);
      const entityName = initialBlockEntity?.name ?? '';

      storage.values.set({
        id: ID.createValueId({
          entityId,
          propertyId: SystemIds.FILTER,
          spaceId,
        }),
        spaceId,
        entity: {
          id: entityId,
          name: entityName,
        },
        property: {
          id: SystemIds.FILTER,
          name: 'Filter',
          dataType: 'TEXT',
        },
        value: newFiltersString,
      });
    },
    [entityId, spaceId, initialBlockEntity?.name, storage.values]
  );

  const setFilterState = React.useCallback(
    (filters: Filter[]) => {
      // Drop any per-group mode entries for columns that no longer have filters,
      // so removing a filter chip cleans up its mode entry too.
      const presentColumns = new Set(filters.map(f => (f.isBacklink ? '_relation' : f.columnId)));
      const trimmedModes: ModesByColumn = {};
      for (const [columnId, mode] of Object.entries(modesByColumnRef.current)) {
        if (presentColumns.has(columnId)) {
          trimmedModes[columnId] = mode;
        }
      }
      modesByColumnRef.current = trimmedModes;
      writeFilterTriple(filters, trimmedModes);
    },
    [writeFilterTriple]
  );

  const setGroupMode = React.useCallback(
    (columnId: string, mode: FilterMode) => {
      const next = { ...modesByColumnRef.current, [columnId]: mode };
      modesByColumnRef.current = next;
      writeFilterTriple(filterStateRef.current, next);
    },
    [writeFilterTriple]
  );

  return {
    filterState,
    resolvedFilterState: effectiveResolvedState,
    isFilterResolving,
    modesByColumn,
    temporaryFilters,
    temporaryModesByColumn,
    filterableProperties: filterableProperties ?? [],
    setFilterState,
    setGroupMode,
    setTemporaryFilters,
    setTemporaryGroupMode,
  };
}
