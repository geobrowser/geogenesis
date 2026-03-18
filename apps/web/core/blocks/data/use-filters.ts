import { SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useValues } from '~/core/sync/use-store';

import { Filter, FilterMode, parseFiltersSync, resolveFilterDisplayNames, toGeoFilterState } from './filters';
import { useDataBlockInstance } from './use-data-block';

export function useFilters(canEdit?: boolean) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { initialBlockEntities } = useEditorStore();
  const initialBlockEntity = React.useMemo(
    () => initialBlockEntities.find(b => b.id === entityId) ?? null,
    [initialBlockEntities, entityId]
  );

  const localFilterValues = useValues({
    selector: v => v.entity.id === entityId && v.property.id === SystemIds.FILTER && v.spaceId === spaceId,
  });

  const filterTriple =
    localFilterValues[0] ?? initialBlockEntity?.values.find(v => v.property.id === SystemIds.FILTER) ?? null;

  const geoFilterString = React.useMemo(() => {
    if (!filterTriple) return null;

    if (filterTriple.property.dataType === 'TEXT') {
      if (filterTriple.value === '') return null;
      return filterTriple.value;
    }

    return null;
  }, [filterTriple]);

  const { filters: filterState, mode: filterMode } = React.useMemo(
    () => parseFiltersSync(geoFilterString),
    [geoFilterString]
  );

  const { data: resolvedFilterState } = useQuery({
    enabled: filterState.length > 0,
    placeholderData: keepPreviousData,
    queryKey: ['blocks', 'data', 'filter-display-names', geoFilterString],
    queryFn: () => resolveFilterDisplayNames(filterState),
  });

  const { data: filterableProperties } = useQuery({
    enabled: true,
    queryKey: ['blocks', 'data', 'filterable-properties', geoFilterString],
    queryFn: async () => {
      const typesInFilter = filterState.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => f.value);
      return await getSchemaFromTypeIds(typesInFilter.map(id => ({ id })));
    },
  });

  // Resolved state has correct valueType from property lookups; fall back to parsed state while loading.
  // On first load (no keepPreviousData yet), resolvedFilterState is undefined until the query completes.
  const isFilterResolving = filterState.length > 0 && resolvedFilterState === undefined;
  const effectiveResolvedState = filterState.length === 0 ? [] : (resolvedFilterState ?? filterState);

  const [temporaryFilterOverride, setTemporaryFilterOverride] = React.useState<Filter[] | null>(null);
  const [temporaryModeOverride, setTemporaryModeOverride] = React.useState<FilterMode | null>(null);

  const temporaryFilters = temporaryFilterOverride ?? effectiveResolvedState;
  const temporaryFilterMode: FilterMode = temporaryModeOverride ?? filterMode;

  const setTemporaryFilters = React.useCallback((filters: Filter[]) => {
    setTemporaryFilterOverride(filters);
  }, []);

  const setTemporaryFilterMode = React.useCallback((mode: FilterMode) => {
    setTemporaryModeOverride(mode);
  }, []);

  React.useEffect(() => {
    if (canEdit === true) {
      setTemporaryFilterOverride(null);
      setTemporaryModeOverride(null);
    }
  }, [canEdit]);

  const filterModeRef = React.useRef(filterMode);
  React.useEffect(() => {
    filterModeRef.current = filterMode;
  }, [filterMode]);

  const filterStateRef = React.useRef(filterState);
  React.useEffect(() => {
    filterStateRef.current = filterState;
  }, [filterState]);

  const writeFilterTriple = React.useCallback(
    (filters: Filter[], mode: FilterMode) => {
      const newFiltersString = filters.length === 0 && mode === 'AND' ? '' : toGeoFilterState(filters, mode);
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
      writeFilterTriple(filters, filterModeRef.current);
    },
    [writeFilterTriple]
  );

  const setFilterMode = React.useCallback(
    (mode: FilterMode) => {
      filterModeRef.current = mode;
      writeFilterTriple(filterStateRef.current, mode);
    },
    [writeFilterTriple]
  );

  return {
    filterState,
    resolvedFilterState: effectiveResolvedState,
    isFilterResolving,
    filterMode,
    temporaryFilters,
    temporaryFilterMode,
    filterableProperties: filterableProperties ?? [],
    setFilterState,
    setFilterMode,
    setTemporaryFilters,
    setTemporaryFilterMode,
  };
}
