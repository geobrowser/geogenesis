import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useEntity } from '~/core/database/entities';
import { upsert } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';
import { useFilters } from './use-filters';

export function useSource() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { name: fromEntityName } = useEntityPageStore();

  const blockEntity = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(entityId),
  });

  const { filterState, setFilterState } = useFilters();

  const source: Source = getSource({
    blockId: blockEntity.id,
    dataEntityRelations: blockEntity.relationsOut,
    currentSpaceId: SpaceId(spaceId),
    filterState,
  });

  const setSource = (newSource: Source) => {
    // We have three source types
    // 1. Collection
    // 2. Query
    // For each source type we need to change the source type
    // For `spaces` we need to update the filter string by setting the new
    // filter state
    removeSourceType({
      relations: blockEntity.relationsOut,
      spaceId: SpaceId(spaceId),
      entityId: EntityId(entityId),
    });
    upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

    if (newSource.type === 'RELATIONS') {
      const maybeExistingRelationType = filterState.filter(f => f.columnId === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE);

      setFilterState(
        [
          ...maybeExistingRelationType,
          {
            columnId: SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
            valueType: 'RELATION',
            value: newSource.value,
            valueName: newSource.name,
          },
        ],
        newSource
      );

      if (fromEntityName && blockEntity.name !== null) {
        upsert(
          {
            attributeId: SYSTEM_IDS.NAME_ATTRIBUTE,
            entityId: entityId,
            entityName: fromEntityName,
            attributeName: 'Name',
            value: { type: 'TEXT', value: fromEntityName },
          },
          spaceId
        );
      }
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
      setFilterState([], newSource);
    }
  };

  return {
    source,
    setSource,
  };
}
