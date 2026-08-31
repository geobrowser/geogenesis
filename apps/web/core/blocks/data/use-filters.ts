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
import { useOptimisticFilterModes } from './use-optimistic-filter-modes';

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

  const {
    modesByColumn: effectiveModesByColumn,
    modesByColumnRef,
    setOptimisticModesByColumn,
  } = useOptimisticFilterModes(modesByColumn);

  const [optimisticFilterState, setOptimisticFilterState] = React.useState<Filter[] | null>(null);

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
        spacesInFilter,
        { includeAllTypeSpaces: true }
      );
    },
  });

  const relationsSnapshot = useSelector(reactiveRelations, r => r, equal);

  // Strip NAME — both the filter picker and the properties menu render it
  // explicitly, so leaving it in here would surface as duplicate-value items
  // in Radix Select.
  const filterableProperties = React.useMemo(() => {
    const base = schemaProperties ?? [];
    return base
      .filter(p => !ID.equals(p.id, SystemIds.NAME_PROPERTY))
      .map(p => mergeRelationValueTypesFromStore(p, store, spaceId));
  }, [schemaProperties, relationsSnapshot, spaceId]);

  // When the query key changes, keepPreviousData returns stale resolved filters from the old key.
  // Fall back to the freshly-parsed filterState until the new resolution completes.
  const freshResolvedState = isPlaceholderData ? undefined : resolvedFilterState;
  const optimisticResolvedState = React.useMemo(
    () =>
      optimisticFilterState && areSameFilterSet(filterState, optimisticFilterState)
        ? mergeFilterDisplayNames(filterState, optimisticFilterState)
        : filterState,
    [filterState, optimisticFilterState]
  );
  const isFilterResolving = filterState.length > 0 && freshResolvedState === undefined;
  const effectiveResolvedState = filterState.length === 0 ? [] : (freshResolvedState ?? optimisticResolvedState);

  React.useEffect(() => {
    if (freshResolvedState !== undefined) {
      setOptimisticFilterState(null);
    }
  }, [freshResolvedState]);

  const [temporaryFilterOverride, setTemporaryFilterOverride] = React.useState<Filter[] | null>(null);
  const [temporaryModesOverride, setTemporaryModesOverride] = React.useState<ModesByColumn | null>(null);

  const temporaryFilters = temporaryFilterOverride ?? effectiveResolvedState;
  const temporaryModesByColumn = temporaryModesOverride ?? effectiveModesByColumn;

  const setTemporaryFilters = React.useCallback(
    (filters: Filter[], modeOverrides?: ModesByColumn) => {
      setTemporaryFilterOverride(filters);
      if (modeOverrides && Object.keys(modeOverrides).length > 0) {
        setTemporaryModesOverride(previous => ({ ...(previous ?? effectiveModesByColumn), ...modeOverrides }));
      }
    },
    [effectiveModesByColumn]
  );

  const setTemporaryGroupMode = React.useCallback(
    (columnId: string, mode: FilterMode) => {
      setTemporaryModesOverride(previous => {
        const next = { ...(previous ?? effectiveModesByColumn) };
        if (mode === 'AND') delete next[columnId];
        else next[columnId] = mode;
        return next;
      });
    },
    [effectiveModesByColumn]
  );

  React.useEffect(() => {
    if (canEdit === true) {
      setTemporaryFilterOverride(null);
      setTemporaryModesOverride(null);
    }
  }, [canEdit]);

  const filterStateRef = React.useRef(filterState);
  React.useEffect(() => {
    filterStateRef.current = filterState;
  }, [filterState]);

  const writeFilterTriple = React.useCallback(
    (filters: Filter[], modes: ModesByColumn) => {
      const newFiltersString = filters.length === 0 ? '' : toGeoFilterState(filters, modes);
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
    /**
     * `modeOverrides` lets a caller commit filters and their modes in one
     * write — the filter prompt chooses a mode for chips that do not exist
     * yet, so writing the mode through a separate setGroupMode call (on a
     * different hook instance, against a filter list without those chips)
     * silently dropped it.
     */
    (filters: Filter[], modeOverrides?: ModesByColumn) => {
      setOptimisticFilterState(filters);
      filterStateRef.current = filters;
      const presentColumnIds = new Set(filters.map(filter => filter.columnId));
      // An AND override removes the column's entry rather than storing an
      // explicit 'AND': the serializer only persists OR, so a stored 'AND'
      // could never deep-equal persisted state and the optimistic override
      // would be stuck forever.
      const merged = { ...modesByColumnRef.current };
      for (const [columnId, mode] of Object.entries(modeOverrides ?? {})) {
        if (mode === 'OR') merged[columnId] = mode;
        else delete merged[columnId];
      }
      const nextModes: ModesByColumn = Object.fromEntries(
        Object.entries(merged).filter(([columnId]) => presentColumnIds.has(columnId))
      );
      setOptimisticModesByColumn(nextModes);
      writeFilterTriple(filters, nextModes);
    },
    [modesByColumnRef, setOptimisticModesByColumn, writeFilterTriple]
  );

  const setGroupMode = React.useCallback(
    (columnId: string, mode: FilterMode) => {
      const nextModes = { ...modesByColumnRef.current };
      if (mode === 'AND') delete nextModes[columnId];
      else nextModes[columnId] = mode;
      // Prune to committed columns: the serializer drops modes for columns
      // without filters, so an unprunable entry would never match persisted
      // state and the optimistic override would be stuck forever, masking
      // (and later overwriting) modes set through other instances.
      const presentColumnIds = new Set(filterStateRef.current.map(filter => filter.columnId));
      const prunedModes: ModesByColumn = Object.fromEntries(
        Object.entries(nextModes).filter(([id]) => presentColumnIds.has(id))
      );
      setOptimisticModesByColumn(prunedModes);
      writeFilterTriple(filterStateRef.current, prunedModes);
    },
    [modesByColumnRef, setOptimisticModesByColumn, writeFilterTriple]
  );

  return {
    filterState,
    resolvedFilterState: effectiveResolvedState,
    isFilterResolving,
    modesByColumn: effectiveModesByColumn,
    temporaryFilters,
    temporaryModesByColumn,
    filterableProperties: filterableProperties ?? [],
    setFilterState,
    setGroupMode,
    setTemporaryFilters,
    setTemporaryGroupMode,
  };
}

function filterIdentity(f: Filter): string {
  return `${f.columnId}\0${f.valueType}\0${f.value}\0${f.isBacklink === true ? '1' : '0'}`;
}

function areSameFilterSet(a: Filter[], b: Filter[]): boolean {
  if (a.length !== b.length) return false;

  const aKeys = a.map(filterIdentity).sort();
  const bKeys = b.map(filterIdentity).sort();

  return aKeys.every((key, index) => key === bKeys[index]);
}

function mergeFilterDisplayNames(filters: Filter[], displayNameSource: Filter[]): Filter[] {
  const namesByKey = new Map(displayNameSource.map(f => [filterIdentity(f), f]));

  return filters.map(filter => {
    const source = namesByKey.get(filterIdentity(filter));
    if (!source) return filter;

    return {
      ...filter,
      columnName: filter.columnName ?? source.columnName,
      valueName: filter.valueName ?? source.valueName,
      relationValueTypes: filter.relationValueTypes ?? source.relationValueTypes,
    };
  });
}
