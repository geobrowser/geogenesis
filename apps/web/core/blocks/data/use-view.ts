import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import { useEntity } from '~/core/database/entities';
import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { ID } from '~/core/id';
import { Entity } from '~/core/io/dto/entities';
import { EntityId, SpaceId } from '~/core/io/schema';
import { Relation } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import { useDataBlockInstance } from './use-data-block';
import { useMapping } from './use-mapping';

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };
type Column = {
  id: string;
  name: string | null;
};

export function useView() {
  const { entityId, spaceId, relationId } = useDataBlockInstance();

  const blockEntity = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(entityId),
  });

  const blockRelation = useEntity({
    spaceId: SpaceId(spaceId),
    id: EntityId(relationId),
  });

  const viewRelation = blockRelation.relationsOut.find(relation => relation.typeOf.id === SYSTEM_IDS.VIEW_ATTRIBUTE);

  const shownColumnRelations = blockRelation.relationsOut.filter(
    relation => relation.typeOf.id === SYSTEM_IDS.SHOWN_COLUMNS || relation.typeOf.id === SYSTEM_IDS.PROPERTIES
  );

  const { mapping, isLoading, isFetched } = useMapping(
    blockRelation.id,
    shownColumnRelations.map(r => r.id)
  );

  // const shownColumnIds = [...shownColumnRelations.map(r => r.toEntity.id), SYSTEM_IDS.NAME_ATTRIBUTE];
  const shownColumnIds = [...(Object.keys(mapping) ?? []), SYSTEM_IDS.NAME_ATTRIBUTE];

  const view = getView(viewRelation);
  const placeholder = getPlaceholder(blockEntity, view);

  const setView = async (newView: DataBlockViewDetails) => {
    const isCurrentView = newView.value === view;

    if (!isCurrentView) {
      if (viewRelation) {
        DB.removeRelation({ relationId: viewRelation.id, spaceId, fromEntityId: EntityId(relationId) });
      }

      const newRelation: StoreRelation = {
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SYSTEM_IDS.VIEW_ATTRIBUTE),
          name: 'View',
        },
        fromEntity: {
          id: EntityId(relationId),
          name: '',
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

    if (selector && newId) {
      DB.upsert(
        {
          attributeId: SYSTEM_IDS.SELECTOR_ATTRIBUTE,
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
    }

    if (!isShown) {
      const newRelation: StoreRelation = {
        id: newId,
        space: spaceId,
        index: INITIAL_RELATION_INDEX_VALUE,
        typeOf: {
          id: EntityId(SYSTEM_IDS.PROPERTIES),
          name: 'Properties',
        },
        fromEntity: {
          id: EntityId(relationId),
          name: blockRelation.name,
        },
        toEntity: {
          id: EntityId(newColumn.id),
          name: newColumn.name,
          renderableType: 'RELATION',
          value: EntityId(newColumn.id),
        },
      };

      console.log('upserting column', { relation: newRelation, spaceId });

      DB.upsertRelation({
        relation: newRelation,
        spaceId,
      });
    } else {
      if (shownColumnRelation) {
        DB.removeRelation({ relationId: shownColumnRelation.id, fromEntityId: EntityId(relationId), spaceId });
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
    toggleProperty,
    mapping,
  };
}

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY';

const getView = (viewRelation: Relation | undefined): DataBlockView => {
  let view: DataBlockView = 'TABLE';

  if (viewRelation) {
    switch (viewRelation?.toEntity.id) {
      case SYSTEM_IDS.TABLE_VIEW:
        view = 'TABLE';
        break;
      case SYSTEM_IDS.LIST_VIEW:
        view = 'LIST';
        break;
      case SYSTEM_IDS.GALLERY_VIEW:
        view = 'GALLERY';
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
    const placeholderTextTriple = blockEntity.triples.find(
      triple => triple.attributeId === SYSTEM_IDS.PLACEHOLDER_TEXT
    );

    if (placeholderTextTriple && placeholderTextTriple.value.type === 'TEXT') {
      text = placeholderTextTriple.value.value;
    }

    // @TODO(relations): This should be a relation pointing to the image entity
    // const placeholderImageRelation = // find relation with attributeId SYSTEM_IDS.PLACEHOLDER_IMAGE
  }

  // @TODO(relations): This should be a relation pointing to the image entity
  return { text, image };
};

const DEFAULT_PLACEHOLDERS: Record<DataBlockView, { text: string; image: string }> = {
  TABLE: {
    text: 'Add an entity',
    image: '/table.png',
  },
  LIST: {
    text: 'Add a list item',
    image: '/list.png',
  },
  GALLERY: {
    text: 'Add a gallery card',
    image: '/gallery.png',
  },
};
