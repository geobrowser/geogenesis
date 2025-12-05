import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { ID } from '~/core/id';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter, fromGeoFilterString, toGeoFilterState } from './filters';
import { useDataBlockInstance } from './use-data-block';

export function useFilters(canEdit?: boolean) {
  const { entityId, spaceId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity: blockEntity } = useQueryEntity({
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
   */
  const {
    data: filterState,
    isLoading,
    isFetched,
  } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['blocks', 'data', 'filter-state', geoFilterString],
    queryFn: async () => {
      return await fromGeoFilterString(geoFilterString);
    },
  });

  const { data: filterableProperties } = useQuery({
    enabled: filterState !== undefined,
    queryKey: ['blocks', 'data', 'filterable-properties', filterState],
    queryFn: async () => {
      const typesInFilter = filterState?.filter(f => f.columnId === SystemIds.TYPES_PROPERTY).map(f => f.value) ?? [];
      return await getSchemaFromTypeIds(typesInFilter);
    },
  });

  // Local state for temporary filters when user cannot edit
  const [temporaryFilters, setTemporaryFilters] = React.useState<Filter[]>([]);

  // Track if temporary filters have been initialized
  const temporaryFiltersInitialized = React.useRef(false);

  // Initialize temporary filters with database filters when user cannot edit
  // Only initialize once to avoid overwriting user changes
  React.useEffect(() => {
    // Only use temporary filters if canEdit is explicitly false (not undefined)
    if (canEdit === false && filterState !== undefined && !temporaryFiltersInitialized.current) {
      setTemporaryFilters(filterState);
      temporaryFiltersInitialized.current = true;
    }
  }, [canEdit, filterState]);

  // Reset initialization when canEdit changes to true (user gains edit access)
  React.useEffect(() => {
    if (canEdit === true) {
      temporaryFiltersInitialized.current = false;
    }
  }, [canEdit]);

  const setFilterState = React.useCallback(
    (filters: Filter[]) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString = newState.length === 0 ? '' : toGeoFilterState(newState);

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

  return {
    filterState: filterState ?? [],
    temporaryFilters,
    filterableProperties: filterableProperties ?? [],
    isLoading,
    isFetched,
    setFilterState,
    setTemporaryFilters,
  };
}
