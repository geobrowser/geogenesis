'use client';

import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk';

import { produce } from 'immer';

import { ID } from '~/core/id';
import { EntityId, SpaceId } from '~/core/io/substream-schema';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { getRelations, useQueryEntity } from '~/core/sync/use-store';

import { Source, getSource, removeSourceType, upsertSourceType } from './source';
import { useDataBlockInstance } from './use-data-block';
import { useFilters } from './use-filters';

export function useSource() {
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { filterState, setFilterState } = useFilters();

  const { initialBlockEntities, blockRelations } = useEditorStore();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === entityId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: entityId,
  });

  const dataEntityRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const source: Source = getSource({
    blockId: EntityId(entityId),
    dataEntityRelations,
    currentSpaceId: SpaceId(spaceId),
    filterState,
  });

  const setSource = (newSource: Source) => {
    removeSourceType({
      relations: dataEntityRelations,
    });
    upsertSourceType({ source: newSource, blockId: EntityId(entityId), spaceId: SpaceId(spaceId) });

    if (newSource.type === 'RELATIONS') {
      setFilterState(
        produce(filterState, draft => {
          const next = draft.filter(
            f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY
          );
          next.push({
            columnId: SystemIds.RELATION_FROM_PROPERTY,
            columnName: 'From',
            valueType: 'RELATION',
            value: newSource.value,
            valueName: newSource.name,
          });
          return next;
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

      // Set the Name selector by default for relation blocks.
      const newRelationId = blockRelations.find(r => r.toEntity.id === entityId)?.entityId ?? '';
      const fromId = relationId || newRelationId;
      const initialBlockRelation = initialBlockEntities.find(b => b.id === fromId) ?? null;
      const shownColumnRelations = getRelations({
        mergeWith: initialBlockRelation?.relations ?? [],
        selector: r =>
          r.fromEntity.id === fromId && (r.type.id === SystemIds.SHOWN_COLUMNS || r.type.id === SystemIds.PROPERTIES),
      });

      const maybeExistingNamePropertyRelation = shownColumnRelations.find(
        t => t.toEntity.id === EntityId(SystemIds.NAME_PROPERTY)
      );

      const selectorValue = `->[${SystemIds.RELATION_TO_PROPERTY}]`;

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
          value: selectorValue,
        });
      } else {
        const newShownColumnId = ID.createEntityId();
        const newShownColumnEntityId = IdUtils.generate();

        storage.values.set({
          id: ID.createValueId({
            entityId: newShownColumnEntityId,
            propertyId: SystemIds.SELECTOR_PROPERTY,
            spaceId,
          }),
          spaceId,
          entity: {
            id: newShownColumnEntityId,
            name: null,
          },
          property: {
            id: SystemIds.SELECTOR_PROPERTY,
            name: 'Selector',
            dataType: 'TEXT',
          },
          value: selectorValue,
        });

        storage.relations.set({
          id: newShownColumnId,
          entityId: newShownColumnEntityId,
          spaceId,
          position: Position.generate(),
          renderableType: 'RELATION',
          type: {
            id: SystemIds.PROPERTIES,
            name: 'Properties',
          },
          fromEntity: {
            id: fromId,
            name: initialBlockRelation?.name ?? null,
          },
          toEntity: {
            id: SystemIds.NAME_PROPERTY,
            name: 'Name',
            value: SystemIds.NAME_PROPERTY,
          },
        });
      }
    }

    if (newSource.type === 'SPACES') {
      // Remove any existing source-injected filters before adding the new space filter.
      setFilterState(
        produce(filterState, draft => {
          const next = draft.filter(
            f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY
          );
          next.push({
            columnId: SystemIds.SPACE_FILTER,
            columnName: 'Space',
            valueType: 'RELATION',
            value: newSource.value[0],
            valueName: null,
          });
          return next;
        })
      );
    }

    if (newSource.type === 'GEO') {
      setFilterState(
        produce(filterState, draft =>
          draft.filter(f => f.columnId !== SystemIds.SPACE_FILTER && f.columnId !== SystemIds.RELATION_FROM_PROPERTY)
        )
      );
    }
  };

  return {
    source,
    setSource,
  };
}
