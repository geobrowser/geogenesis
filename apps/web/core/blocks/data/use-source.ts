import { SYSTEM_IDS } from '@geogenesis/sdk';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useTableBlockInstance } from '~/core/state/table-block-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useFilters } from './use-filters';

export function useSource() {
  const { entityId, spaceId } = useTableBlockInstance();

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const { filterState, setFilterState } = useFilters();

  const source: Source = React.useMemo(() => {
    return getSource({
      blockId: blockEntity.id,
      dataEntityRelations: blockEntity.relationsOut,
      currentSpaceId: SpaceId(spaceId),
      filterState,
    });
  }, [blockEntity.id, blockEntity.relationsOut, spaceId, filterState]);

  const setSource = React.useCallback(
    (newSource: Source) => {
      // We have three source types
      // 1. Collection
      // 2. Query
      // For each source type we need to change the source type
      // For `spaces` we need to update the filter string by setting the new
      // filter state
      // @TODO: This should handle setting the source based on what user selected
      removeSourceType({
        relations: blockEntity.relationsOut,
        spaceId: SpaceId(spaceId),
        entityId: EntityId(entityId),
      });
      upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

      if (newSource.type === 'RELATIONS') {
        setFilterState(
          [
            {
              columnId: SYSTEM_IDS.ENTITY_FILTER,
              valueType: 'RELATION',
              value: newSource.value,
              valueName: newSource.name,
            },
          ],
          newSource
        );
      }

      if (newSource.type === 'SPACES') {
        // We only allow one space filter at a time currently, so remove any existing space filters before
        // adding the new one.
        const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER) ?? [];

        setFilterState(
          [
            ...filtersWithoutSpaces,
            { columnId: SYSTEM_IDS.SPACE_FILTER, valueType: 'RELATION', value: newSource.value[0], valueName: null },
          ],
          newSource
        );
      }

      if (newSource.type === 'GEO') {
        const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SYSTEM_IDS.SPACE_FILTER) ?? [];
        setFilterState(filtersWithoutSpaces, newSource);
      }
    },
    [entityId, blockEntity.relationsOut, spaceId, setFilterState, filterState]
  );

  return {
    source,
    setSource,
  };
}
