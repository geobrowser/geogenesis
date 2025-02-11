import { SYSTEM_IDS } from '@geogenesis/sdk';

import { useEntity } from '~/core/database/entities';
import { upsert } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';
import { useFilters } from './use-filters';
import { useView } from './use-view';

export function useSource() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { name: fromEntityName } = useEntityPageStore();
  const { shownColumnRelations, toggleProperty } = useView();

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

      /**
       * When creating a relation block we set the Properties to set the Name
       * selector by default. If there's no Name property set on the Blocks
       * relation then we create it.
       */
      const maybeExistingNamePropertyRelation = shownColumnRelations.find(
        t => t.toEntity.id === SYSTEM_IDS.NAME_ATTRIBUTE
      );

      if (maybeExistingNamePropertyRelation) {
        upsert(
          {
            attributeId: SYSTEM_IDS.SELECTOR_ATTRIBUTE,
            attributeName: 'Selector',
            entityId: maybeExistingNamePropertyRelation.id,
            entityName: null,
            value: { type: 'TEXT', value: `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]` },
          },
          spaceId
        );
      } else {
        toggleProperty(
          {
            id: SYSTEM_IDS.NAME_ATTRIBUTE,
            name: 'Name',
          },
          `->[${SYSTEM_IDS.RELATION_TO_ATTRIBUTE}]`
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
