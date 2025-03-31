import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { getSchemaFromTypeIds } from '~/core/database/entities';
import { upsert } from '~/core/database/write';
import { useQueryEntity } from '~/core/sync/use-store';

import { Filter, fromGeoFilterState, toGeoFilterState } from './filters';
import { Source } from './source';
import { useDataBlockInstance } from './use-data-block';

export function useFilters() {
  const { entityId, spaceId } = useDataBlockInstance();

  const { entity: blockEntity } = useQueryEntity({
    id: entityId,
    spaceId,
  });

  const filterTriple = React.useMemo(() => {
    return blockEntity?.triples.find(t => t.attributeId === SystemIds.FILTER);
  }, [blockEntity?.triples]);

  const geoFilterString = React.useMemo(() => {
    if (!filterTriple) return null;

    if (filterTriple.value.type === 'TEXT') {
      if (filterTriple.value.value === '') return null;
      return filterTriple.value.value;
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
      return await fromGeoFilterState(geoFilterString);
    },
  });

  const { data: filterableProperties } = useQuery({
    enabled: filterState !== undefined,
    queryKey: ['blocks', 'data', 'filterable-properties', filterState],
    queryFn: async () => {
      const typesInFilter = filterState?.filter(f => f.columnId === SystemIds.TYPES_ATTRIBUTE).map(f => f.value) ?? [];
      return await getSchemaFromTypeIds(typesInFilter);
    },
  });

  const setFilterState = React.useCallback(
    (filters: Filter[], source: Source) => {
      const newState = filters.length === 0 ? [] : filters;

      // We can just set the string as empty if the new state is empty. Alternatively we just delete the triple.
      const newFiltersString = newState.length === 0 ? '' : toGeoFilterState(newState, source);

      const entityName = blockEntity?.name ?? '';

      return upsert(
        {
          attributeId: SystemIds.FILTER,
          attributeName: 'Filter',
          entityId,
          entityName,
          value: {
            type: 'TEXT',
            value: newFiltersString,
          },
        },
        spaceId
      );
    },
    [entityId, spaceId, blockEntity?.name]
  );

  return {
    filterState: filterState ?? [],
    filterableProperties: filterableProperties ?? [],
    isLoading,
    isFetched,
    setFilterState,
  };
}
