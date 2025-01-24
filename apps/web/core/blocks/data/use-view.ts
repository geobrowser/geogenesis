import { SYSTEM_IDS } from '@geogenesis/sdk';
import { INITIAL_RELATION_INDEX_VALUE } from '@geogenesis/sdk/constants';

import * as React from 'react';

import { useEntity } from '~/core/database/entities';
import { StoreRelation } from '~/core/database/types';
import { DB } from '~/core/database/write';
import { Entity } from '~/core/io/dto/entities';
import { EntityId, SpaceId } from '~/core/io/schema';
import { useTableBlockInstance } from '~/core/state/table-block-store';
import { Relation } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

type DataBlockViewDetails = { name: string; id: string; value: DataBlockView };

export function useView() {
  const { entityId, spaceId, relationId } = useTableBlockInstance();

  const blockRelation = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(relationId), [relationId]),
  });

  const blockEntity = useEntity({
    spaceId: React.useMemo(() => SpaceId(spaceId), [spaceId]),
    id: React.useMemo(() => EntityId(entityId), [entityId]),
  });

  const viewRelation = React.useMemo(
    () => blockRelation.relationsOut.find(relation => relation.typeOf.id === SYSTEM_IDS.VIEW_ATTRIBUTE),
    [blockRelation.relationsOut]
  );

  const shownColumnRelations = React.useMemo(
    () => blockRelation.relationsOut.filter(relation => relation.typeOf.id === SYSTEM_IDS.SHOWN_COLUMNS),
    [blockRelation.relationsOut]
  );

  const shownColumnIds = React.useMemo(
    () => [...(shownColumnRelations.map(item => item.toEntity.id) ?? []), SYSTEM_IDS.NAME_ATTRIBUTE],
    [shownColumnRelations]
  );

  const view = React.useMemo(() => getView(viewRelation), [viewRelation]);
  const placeholder = React.useMemo(() => getPlaceholder(blockEntity, view), [blockEntity, view]);

  const setView = React.useCallback(
    async (newView: DataBlockViewDetails) => {
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
    },
    [relationId, spaceId, viewRelation, view]
  );

  return {
    view,
    placeholder,
    viewRelation,
    setView,
    shownColumnIds,
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
