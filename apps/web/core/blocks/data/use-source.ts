import { SystemIds } from '@graphprotocol/grc-20';

import { upsert } from '~/core/database/write';
import { EntityId, SpaceId } from '~/core/io/schema';
// import { useEntityPageStore } from '~/core/state/entity-page-store/entity-store';
import { useQueryEntity } from '~/core/sync/use-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';
import { useFilters } from './use-filters';
import { useView } from './use-view';

export function useSource() {
  const { entityId, spaceId } = useDataBlockInstance();
  // const { name: fromEntityName } = useEntityPageStore();
  const { shownColumnRelations, toggleProperty } = useView();

  const { filterState, setFilterState } = useFilters();

  const { entity: blockEntity } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const source: Source = getSource({
    blockId: EntityId(entityId),
    dataEntityRelations: blockEntity?.relationsOut ?? [],
    currentSpaceId: SpaceId(spaceId),
    filterState,
  });

  const setSource = (newSource: Source) => {
    removeSourceType({
      relations: blockEntity?.relationsOut ?? [],
      spaceId: SpaceId(spaceId),
    });
    upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

    if (newSource.type === 'RELATIONS') {
      const maybeExistingRelationType = filterState.filter(f => f.columnId === SystemIds.RELATION_TYPE_ATTRIBUTE);

      setFilterState(
        [
          ...maybeExistingRelationType,
          {
            columnId: SystemIds.RELATION_FROM_ATTRIBUTE,
            columnName: 'From',
            valueType: 'RELATION',
            value: newSource.value,
            valueName: newSource.name,
          },
        ],
        newSource
      );

      // @NOTE disabled since overwrites user set titles if changing source before onBlur writes ops

      // if (fromEntityName && blockEntity?.name !== undefined && blockEntity?.name !== null) {
      //   upsert(
      //     {
      //       attributeId: SystemIds.NAME_ATTRIBUTE,
      //       entityId: entityId,
      //       entityName: fromEntityName,
      //       attributeName: 'Name',
      //       value: { type: 'TEXT', value: fromEntityName },
      //     },
      //     spaceId
      //   );
      // }

      /**
       * When creating a relation block we set the Properties to set the Name
       * selector by default. If there's no Name property set on the Blocks
       * relation then we create it.
       */
      const maybeExistingNamePropertyRelation = shownColumnRelations.find(
        t => t.toEntity.id === EntityId(SystemIds.NAME_ATTRIBUTE)
      );

      if (maybeExistingNamePropertyRelation) {
        upsert(
          {
            attributeId: SystemIds.SELECTOR_ATTRIBUTE,
            attributeName: 'Selector',
            entityId: maybeExistingNamePropertyRelation.id,
            entityName: null,
            value: { type: 'TEXT', value: `->[${SystemIds.RELATION_TO_ATTRIBUTE}]` },
          },
          spaceId
        );
      } else {
        toggleProperty(
          {
            id: SystemIds.NAME_ATTRIBUTE,
            name: 'Name',
          },
          `->[${SystemIds.RELATION_TO_ATTRIBUTE}]`
        );
      }
    }

    if (newSource.type === 'SPACES') {
      // We only allow one space filter at a time currently, so remove any existing space filters before
      // adding the new one.
      const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SystemIds.SPACE_FILTER) ?? [];

      setFilterState(
        [
          ...filtersWithoutSpaces,
          {
            columnId: SystemIds.SPACE_FILTER,
            columnName: 'Space',
            valueType: 'RELATION',
            value: newSource.value[0],
            valueName: null,
          },
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
