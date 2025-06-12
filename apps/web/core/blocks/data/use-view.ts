import { SystemIds } from '@graphprotocol/grc-20';
import { INITIAL_RELATION_INDEX_VALUE } from '@graphprotocol/grc-20/constants';

import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { ID } from '~/core/id';
import { EntityId } from '~/core/io/schema';
import { useQueryEntity } from '~/core/sync/use-store';
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

  const { entity: blockEntity } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const { entity: blockRelation } = useQueryEntity({
    spaceId: spaceId,
    id: relationId,
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
      if (viewRelation) {
        DB.removeRelation({ relation: viewRelation, spaceId });
      }

      const newRelation: StoreRelation = {
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SystemIds.VIEW_PROPERTY),
          name: 'View',
        },
        fromEntity: {
          id: EntityId(relationId),
          name: blockEntity?.name ?? null,
        },
        toEntity: {
          id: EntityId(newView.id),
          name: newView.name,
          renderableType: 'RELATION',
          value: EntityId(newView.id),
        },
      };

      DB.upsertRelation({
        relation: newRelation,
        spaceId,
      });
    }
  };

  const toggleProperty = (newColumn: Column, selector?: string) => {
    const isShown = shownColumnRelations.map(relation => relation.toEntity.id).includes(EntityId(newColumn.id));
    const shownColumnRelation = shownColumnRelations.find(relation => relation.toEntity.id === newColumn.id);

    const newId = selector ? ID.createEntityId() : undefined;

    const existingMapping = mapping[newColumn.id];

    // We run a separate branch of logic for RELATIONS queries where a selector may get passed through.
    //
    // If the selector is already active, when toggling the property it removes the shown property.
    // If the selector is not active, is deletes any existing shown property for the property id and
    // creates a new one with the new selector.
    //
    // Yes this looks janky
    if (selector && newId) {
      if (selector === existingMapping) {
        if (shownColumnRelation) {
          DB.removeRelation({ relation: shownColumnRelation, spaceId });
        }
      } else {
        if (shownColumnRelation) {
          // @TODO: We should instead just upsert the new selector instead of removing and creating
          // a new relation. Main issue right now is that the block won't re-render if we use this
          // approach due to how the mappings are queried.
          DB.removeRelation({ relation: shownColumnRelation, spaceId });
        }

        DB.upsert(
          {
            attributeId: SystemIds.SELECTOR_PROPERTY,
            attributeName: 'Selector',
            entityId: newId,
            entityName: null,
            value: {
              type: 'TEXT',
              value: selector,
            },
          },
          spaceId
        );

        const newRelation: StoreRelation = {
          id: newId,
          space: spaceId,
          index: INITIAL_RELATION_INDEX_VALUE,
          typeOf: {
            id: EntityId(SystemIds.PROPERTIES),
            name: 'Properties',
          },
          fromEntity: {
            id: EntityId(relationId),
            name: blockRelation?.name ?? null,
          },
          toEntity: {
            id: EntityId(newColumn.id),
            name: newColumn.name,
            renderableType: 'RELATION',
            value: EntityId(newColumn.id),
          },
        };

        DB.upsertRelation({
          relation: newRelation,
          spaceId,
        });
      }

      return;
    }

    if (!isShown) {
      const newRelation: StoreRelation = {
        id: newId,
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SystemIds.PROPERTIES),
          name: 'Properties',
        },
        fromEntity: {
          id: EntityId(relationId),
          name: blockRelation?.name ?? null,
        },
        toEntity: {
          id: EntityId(newColumn.id),
          name: newColumn.name,
          renderableType: 'RELATION',
          value: EntityId(newColumn.id),
        },
      };

      DB.upsertRelation({
        relation: newRelation,
        spaceId,
      });
    } else {
      if (shownColumnRelation) {
        DB.removeRelation({ relation: shownColumnRelation, spaceId });
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
