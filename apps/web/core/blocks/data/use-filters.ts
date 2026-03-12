import { SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter, FilterMode, fromGeoFilterString, toGeoFilterState } from './filters';
import { useDataBlockInstance } from './use-data-block';

export function useFilters(canEdit?: boolean) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity: blockEntity, isLoading: isBlockEntityLoading } = useQueryEntity({
    id: entityId,
    spaceId,
  });

  const filterTriple = React.useMemo(() => {
    return blockEntity?.values.find(t => t.property.id === SystemIds.FILTER);
  }, [blockEntity?.values]);

  const geoFilterString = React.useMemo(() => {
    if (!filterTriple) return null;

    if (filterTriple.property.dataType === 'TEXT') {
      if (filterTriple.value === '') return null;
      return filterTriple.value;
    }

    return null;
  }, [filterTriple]);

  /**
   * The filter state is derived from the filter string and the source. The source
   * might include a list of spaceIds to include in the filter. The filter string
   * only includes _data_ filters, but not _where_ to query from.
   *
   * We wait for the block entity to load before running this query to ensure we have
   * the correct filter string. Otherwise, on first render we'd query with null and
   * get empty filters, then re-query once the entity loads.
   */
  const {
    data: filterStateResult,
    isLoading,
    isFetched,
  } = useQuery({
    enabled: !isBlockEntityLoading,
    placeholderData: keepPreviousData,
    queryKey: ['blocks', 'data', 'filter-state', geoFilterString],
    queryFn: async () => {
      return await fromGeoFilterString(geoFilterString);
    },
  });

  const filterState = filterStateResult?.filters ?? [];
  const filterMode: FilterMode = filterStateResult?.mode ?? 'AND';

  const { data: filterableProperties } = useQuery({
    enabled: filterStateResult !== undefined,
    queryKey: ['blocks', 'data', 'filterable-properties', filterState],
    queryFn: async () => {
      const typesInFilter = filterState.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => f.value);
      return await getSchemaFromTypeIds(typesInFilter.map(id => ({ id })));
    },
  });

  // Local state for temporary filter overrides when user cannot edit
  // null means "use database filters", an array means "user has modified filters locally"
  const [temporaryFilterOverride, setTemporaryFilterOverride] = React.useState<Filter[] | null>(null);
  const [temporaryModeOverride, setTemporaryModeOverride] = React.useState<FilterMode | null>(null);

  // For non-editors: use their local override if they've modified filters, otherwise use database filters
  // This avoids the race condition of trying to initialize state from an async query
  const temporaryFilters = temporaryFilterOverride ?? filterState;
  const temporaryFilterMode: FilterMode = temporaryModeOverride ?? filterMode;

  // Wrapper that sets the override
  const setTemporaryFilters = React.useCallback((filters: Filter[]) => {
    setTemporaryFilterOverride(filters);
  }, []);

  const setTemporaryFilterMode = React.useCallback((mode: FilterMode) => {
    setTemporaryModeOverride(mode);
  }, []);

  // Reset override when canEdit changes to true (user gains edit access)
  React.useEffect(() => {
    if (canEdit === true) {
      setTemporaryFilterOverride(null);
      setTemporaryModeOverride(null);
    }
  }, [canEdit]);

  // Refs to track the latest persisted values so that setFilterState / setFilterMode
  // never use a stale closure. Without these, toggling the mode and then immediately
  // adding a filter would overwrite the mode back because the async query hadn't
  // refetched yet.
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
      const entityName = blockEntity?.name ?? '';

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
    [entityId, spaceId, blockEntity?.name, storage.values]
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
    filterMode,
    temporaryFilters,
    temporaryFilterMode,
    filterableProperties: filterableProperties ?? [],
    isLoading,
    isFetched,
    setFilterState,
    setFilterMode,
    setTemporaryFilters,
    setTemporaryFilterMode,
  };
}
