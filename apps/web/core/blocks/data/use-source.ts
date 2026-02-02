'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { produce } from 'immer';

import { ID } from '~/core/id';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity } from '~/core/sync/use-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';
import { useFilters } from './use-filters';
import { useView } from './use-view';

export function useSource() {
  const { entityId, spaceId } = useDataBlockInstance();
  const { shownColumnRelations, toggleProperty } = useView();
  const { storage } = useMutate();

  const { filterState, setFilterState } = useFilters();

  const { entity: blockEntity } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const source: Source = getSource({
    blockId: EntityId(entityId),
    dataEntityRelations: blockEntity?.relations ?? [],
    currentSpaceId: SpaceId(spaceId),
    filterState,
  });

  const setSource = (newSource: Source) => {
    removeSourceType({
      relations: blockEntity?.relations ?? [],
    });
    upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

    if (newSource.type === 'RELATIONS') {
      setFilterState(
        produce(filterState, draft => {
          draft.push({
            columnId: SystemIds.RELATION_FROM_PROPERTY,
            columnName: 'From',
            valueType: 'RELATION',
            value: newSource.value,
            valueName: newSource.name,
          });
        })
      );

      // @NOTE disabled since overwrites user set titles if changing source before onBlur writes ops

      // if (fromEntityName && blockEntity?.name !== undefined && blockEntity?.name !== null) {
      //   upsert(
      //     {
      //       attributeId: SystemIds.NAME_PROPERTY,
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
        t => t.toEntity.id === EntityId(SystemIds.NAME_PROPERTY)
      );

      if (maybeExistingNamePropertyRelation) {
        storage.values.set({
          id: ID.createValueId({
            entityId: maybeExistingNamePropertyRelation.entityId,
            propertyId: SystemIds.SELECTOR_PROPERTY,
            spaceId,
          }),
          entity: {
            id: maybeExistingNamePropertyRelation.entityId,
            name: null,
          },
          property: {
            id: SystemIds.SELECTOR_PROPERTY,
            name: 'Selector',
            dataType: 'TEXT',
          },
          spaceId,
          value: `->[${SystemIds.RELATION_TO_PROPERTY}]`,
        });
      } else {
        toggleProperty(
          {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
          },
          `->[${SystemIds.RELATION_TO_PROPERTY}]`
        );
      }
    }

    if (newSource.type === 'SPACES') {
      // We only allow one space filter at a time currently, so remove any existing space filters before
      // adding the new one.
      const filtersWithoutSpaces = filterState?.filter(f => f.columnId !== SystemIds.SPACE_FILTER) ?? [];

      setFilterState([
        ...filtersWithoutSpaces,
        {
          columnId: SystemIds.SPACE_FILTER,
          columnName: 'Space',
          valueType: 'RELATION',
          value: newSource.value[0],
          valueName: null,
        },
      ]);
    }

    if (newSource.type === 'GEO') {
      setFilterState([]);
    }
  };

  return {
    source,
    setSource,
  };
}
