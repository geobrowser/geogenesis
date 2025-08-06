import { IdUtils, Position, SystemIds } from '@graphprotocol/grc-20';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { getRelationEntityRelations } from '~/core/io/v2/queries';
import { useEditorStore } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity, useQueryRelation } from '~/core/sync/use-store';
import { getImagePath } from '~/core/utils/utils';
import { Entity, Relation } from '~/core/v2.types';

import { useDataBlockInstance } from './use-data-block';
import { useMapping } from './use-mapping';

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };
type Column = {
  id: string;
  name: string | null;
};

export function useView() {
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const { storage } = useMutate();

  const { entity: blockEntity } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const { blockRelations } = useEditorStore();
  const newRelationId = blockRelations.find(relation => relation.toEntity.id === entityId)?.entityId ?? '';

  const { entity: blockRelation } = useQueryEntity({
    spaceId: spaceId,
    id: newRelationId,
  });

  const viewRelation = blockRelation?.relations.find(relation => relation.type.id === SystemIds.VIEW_PROPERTY);

  const shownColumnRelations =
    blockRelation?.relations.filter(
      // We fall back to an old properties used to render shown columns.
      relation => relation.type.id === SystemIds.SHOWN_COLUMNS || relation.type.id === SystemIds.PROPERTIES
    ) ?? [];

  const { mapping, isLoading, isFetched } = useMapping(
    entityId,
    shownColumnRelations.map(r => r.id)
  );

  // @TODO: We shouldn't need the name attribute here since it's automatically
  // added in useMapping if it's not already part of the properties list.
  const shownColumnIds = [...Object.keys(mapping), SystemIds.NAME_PROPERTY];

  const view = getView(viewRelation);
  const placeholder = getPlaceholder(blockEntity, view);

  const setView = async (newView: DataBlockViewDetails) => {
    const isCurrentView = newView.value === view;

    if (!isCurrentView) {
      if (!viewRelation) {
        const newRelation: Relation = {
          id: IdUtils.generate(),
          // @TODO(migration): Reuse existing entity?
          entityId: IdUtils.generate(),
          spaceId: spaceId,
          position: Position.generate(),
          renderableType: 'RELATION',
          type: {
            id: SystemIds.VIEW_PROPERTY,
            name: 'View',
          },
          fromEntity: {
            id: newRelationId,
            name: blockEntity?.name ?? null,
          },
          toEntity: {
            id: newView.id,
            name: newView.name,
            value: newView.id,
          },
        };

        storage.relations.set(newRelation);
        return;
      }

      storage.relations.update(viewRelation, draft => {
        draft.toEntity = {
          id: newView.id,
          name: newView.name,
          value: newView.id,
        };
      });
    }
  };

  const toggleProperty = (newColumn: Column, selector?: string) => {
    const isShown = shownColumnRelations.map(relation => relation.toEntity.id).includes(EntityId(newColumn.id));
    const shownColumnRelation = shownColumnRelations.find(relation => relation.toEntity.id === newColumn.id);

    const newId = selector ? ID.createEntityId() : undefined;
    const newRelationEntityId = IdUtils.generate();

    const existingMapping = mapping[newColumn.id];

    // We run a separate branch of logic for RELATIONS queries where a selector may get passed through.
    //
    // If the selector is already active, when toggling the property it removes the shown property.
    // If the selector is not active, is deletes any existing shown property for the property id and
    // creates a new one with the new selector.
    //
    // Yes this looks janky
    if (selector && newId) {
      if (selector !== existingMapping) {
        if (shownColumnRelation) {
          storage.values.set({
            id: ID.createValueId({
              entityId: shownColumnRelation.entityId,
              propertyId: SystemIds.SELECTOR_PROPERTY,
              spaceId,
            }),
            spaceId,
            entity: {
              id: shownColumnRelation.entityId,
              name: null,
            },
            property: {
              id: SystemIds.SELECTOR_PROPERTY,
              name: 'Selector',
              dataType: 'TEXT',
            },
            value: selector,
          });

          return;
        }

        storage.values.set({
          id: ID.createValueId({
            entityId: newRelationEntityId,
            propertyId: SystemIds.SELECTOR_PROPERTY,
            spaceId,
          }),
          spaceId,
          entity: {
            id: newRelationEntityId,
            name: null,
          },
          property: {
            id: SystemIds.SELECTOR_PROPERTY,
            name: 'Selector',
            dataType: 'TEXT',
          },
          value: selector,
        });

        storage.relations.set({
          id: newId,
          entityId: newRelationEntityId,
          spaceId: spaceId,
          position: Position.generate(),
          renderableType: 'RELATION',
          type: {
            id: SystemIds.PROPERTIES,
            name: 'Properties',
          },
          fromEntity: {
            id: relationId,
            name: blockRelation?.name ?? null,
          },
          toEntity: {
            id: newColumn.id,
            name: newColumn.name,
            value: newColumn.id,
          },
        });
      }

      return;
    }

    if (!isShown) {
      storage.relations.set({
        id: IdUtils.generate(),
        entityId: newRelationEntityId,
        spaceId: spaceId,
        position: Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.PROPERTIES,
          name: 'Properties',
        },
        fromEntity: {
          id: relationId,
          name: blockRelation?.name ?? null,
        },
        toEntity: {
          id: newColumn.id,
          name: newColumn.name,
          value: newColumn.id,
        },
      });
    } else {
      if (shownColumnRelation) {
        storage.relations.delete(shownColumnRelation);
      }
    }
  };

  return {
    isLoading,
    isFetched,
    view,
    placeholder,
    viewRelation,
    setView,
    shownColumnIds,
    shownColumnRelations,
    toggleProperty,
    mapping,
  };
}

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY' | 'BULLETED_LIST';

const getView = (viewRelation: Relation | undefined): DataBlockView => {
  let view: DataBlockView = 'TABLE';

  if (viewRelation) {
    switch (viewRelation?.toEntity.id.toString()) {
      case SystemIds.TABLE_VIEW:
        view = 'TABLE';
        break;
      case SystemIds.LIST_VIEW:
        view = 'LIST';
        break;
      case SystemIds.GALLERY_VIEW:
        view = 'GALLERY';
        break;
      case SystemIds.BULLETED_LIST_VIEW:
        view = 'BULLETED_LIST';
        break;
      default:
        // We default to TABLE above
        break;
    }
  }

  return view;
};

const getPlaceholder = (blockEntity: Entity | null | undefined, view: DataBlockView) => {
  let text = DEFAULT_PLACEHOLDERS[view].text;
  // eslint-disable-next-line prefer-const
  let image = getImagePath(DEFAULT_PLACEHOLDERS[view].image);

  if (blockEntity) {
    const placeholderTextTriple = blockEntity.values.find(value => value.property.id === SystemIds.PLACEHOLDER_TEXT);

    if (placeholderTextTriple && placeholderTextTriple.property.dataType === 'TEXT') {
      text = placeholderTextTriple.value;
    }

    // @TODO(relations): This should be a relation pointing to the image entity
    // const placeholderImageRelation = // find relation with attributeId SystemIds.PLACEHOLDER_IMAGE
  }

  // @TODO(relations): This should be a relation pointing to the image entity
  return { text, image };
};

const DEFAULT_PLACEHOLDERS: Record<DataBlockView, { text: string; image: string }> = {
  TABLE: {
    text: 'Add your first entity row to get started',
    image: '/table.png',
  },
  LIST: {
    text: 'Add your first entity row to get started',
    image: '/list.png',
  },
  GALLERY: {
    text: 'Add your first gallery card to get started',
    image: '/gallery.png',
  },
  BULLETED_LIST: {
    text: 'Add your first bullet item to get started',
    image: '/list.png',
  },
};
