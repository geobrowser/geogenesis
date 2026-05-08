import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { arrayMove } from '@dnd-kit/sortable';

import * as React from 'react';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity } from '~/core/sync/use-store';
import { Entity, Relation } from '~/core/types';
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
  const { storage } = useMutate();

  const { entity: blockEntity } = useQueryEntity({
    spaceId: spaceId,
    id: entityId,
  });

  const { blockRelations, initialBlockEntities } = useEditorStoreLite();
  const newRelationId = blockRelations.find(relation => relation.toEntity.id === entityId)?.entityId ?? '';

  const initialBlockRelation = initialBlockEntities.find(b => b.id === newRelationId) ?? null;

  const { entity: blockRelation } = useQueryEntity({
    spaceId: spaceId,
    id: newRelationId,
  });

  const blockRelationRelations = blockRelation?.relations ?? initialBlockRelation?.relations ?? [];
  const blockRelationName = blockRelation?.name ?? initialBlockRelation?.name ?? null;

  const viewRelation = blockRelationRelations.find(r => r.type.id === SystemIds.VIEW_PROPERTY);

  const shownColumnRelations = blockRelationRelations.filter(
    // We fall back to an old property used to render shown columns.
    r => r.type.id === SystemIds.SHOWN_COLUMNS || r.type.id === SystemIds.PROPERTIES
  );

  const orderedShownColumnRelations = React.useMemo(
    () =>
      [...shownColumnRelations].sort((a, b) =>
        Position.compare(a.position ?? null, b.position ?? null)
      ),
    [shownColumnRelations]
  );

  const { mapping, isLoading, isFetched } = useMapping(
    entityId,
    orderedShownColumnRelations.map(r => r.id)
  );

  const shownColumnIds = [SystemIds.NAME_PROPERTY, ...orderedShownColumnRelations.map(r => r.toEntity.id)];

  const view = getView(viewRelation);
  const placeholder = getPlaceholder(blockEntity, view);

  /** Append new shown columns after existing ones (avoid `Position.generate()` random order). */
  const nextPropertiesColumnPosition = React.useCallback((): string | undefined => {
    const sorted = [...shownColumnRelations].sort((a, b) =>
      Position.compare(a.position ?? null, b.position ?? null)
    );
    const last = sorted[sorted.length - 1]?.position;
    const lastStr = typeof last === 'string' && last.length > 0 ? last : null;
    const generated = Position.generateBetween(lastStr, null);
    return generated ?? undefined;
  }, [shownColumnRelations]);

  const setView = async (newView: DataBlockViewDetails) => {
    if (newView.value === view) return;

    storage.relations.replaceSingleton({
      id: IdUtils.generate(),
      entityId: IdUtils.generate(),
      spaceId,
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
    });
  };

  const toggleProperty = (newColumn: Column, selector?: string) => {
    // All live relations for this column on the current block-relation. Usually
    // 0 or 1, but can be >1 if pre-existing buggy state left duplicates — in
    // which case toggle-off must tombstone every match to fully hide the
    // column, and `shownColumnRelation` (the canonical one for in-place value
    // updates in the selector branch) is just the first.
    const matchingShownColumnRelations = shownColumnRelations.filter(r => r.toEntity.id === newColumn.id);
    const isShown = matchingShownColumnRelations.length > 0;
    const shownColumnRelation = matchingShownColumnRelations[0];

    const newRelationEntityId = shownColumnRelation?.entityId ?? IdUtils.generate();

    const existingMapping = mapping[newColumn.id];

    // RELATIONS queries pass a selector. Behavior:
    // - clicking the active selector → toggle the column off
    // - clicking a different selector → keep the column, swap its selector value
    // - clicking with no live column → upsert (resurrects any tombstoned match
    //   so position/id survive show/hide cycles)
    if (selector) {
      if (selector === existingMapping) {
        if (matchingShownColumnRelations.length > 0) {
          storage.relations.deleteMany(matchingShownColumnRelations);
        }
        return;
      }

      // If there are duplicate live relations for this column, tombstone all
      // but the canonical one so the selector value we're about to write
      // doesn't disagree with itself across duplicates.
      if (matchingShownColumnRelations.length > 1) {
        storage.relations.deleteMany(matchingShownColumnRelations.slice(1));
      }

      // Ensure the relation exists (resurrecting a tombstoned match if any)
      // before writing the selector value, so the value lands on whichever
      // entityId the upsert actually used.
      const targetEntityId = shownColumnRelation
        ? shownColumnRelation.entityId
        : storage.relations.upsertByKey({
            id: ID.createEntityId(),
            entityId: newRelationEntityId,
            spaceId,
            position: nextPropertiesColumnPosition(),
            renderableType: 'RELATION',
            type: {
              id: SystemIds.PROPERTIES,
              name: 'Properties',
            },
            fromEntity: {
              id: relationId,
              name: blockRelationName,
            },
            toEntity: {
              id: newColumn.id,
              name: newColumn.name,
              value: newColumn.id,
            },
          }).entityId;

      storage.values.set({
        id: ID.createValueId({
          entityId: targetEntityId,
          propertyId: SystemIds.SELECTOR_PROPERTY,
          spaceId,
        }),
        spaceId,
        entity: {
          id: targetEntityId,
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

    if (isShown) {
      storage.relations.deleteMany(matchingShownColumnRelations);
      return;
    }

    storage.relations.upsertByKey({
      id: IdUtils.generate(),
      entityId: newRelationEntityId,
      spaceId,
      position: nextPropertiesColumnPosition(),
      renderableType: 'RELATION',
      type: {
        id: SystemIds.PROPERTIES,
        name: 'Properties',
      },
      fromEntity: {
        id: newRelationId,
        name: blockRelationName,
      },
      toEntity: {
        id: newColumn.id,
        name: newColumn.name,
        value: newColumn.id,
      },
    });
  };

  const hideAllShownPropertyColumns = React.useCallback(() => {
    for (const rel of [...shownColumnRelations]) {
      storage.relations.delete(rel);
    }
  }, [shownColumnRelations, storage]);

  const reorderShownPropertyRelations = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      const sorted = [...shownColumnRelations].sort((a, b) =>
        Position.compare(a.position ?? null, b.position ?? null)
      );
      if (fromIndex < 0 || fromIndex >= sorted.length) return;
      if (toIndex < 0 || toIndex >= sorted.length) return;
      const moved = arrayMove(sorted, fromIndex, toIndex);
      const slotPositions = sorted.map(r => r.position ?? Position.generate());
      for (let i = 0; i < moved.length; i++) {
        const rel = moved[i];
        const pos = slotPositions[i];
        if (!pos) continue;
        storage.relations.update(rel, draft => {
          draft.position = pos;
        });
      }
    },
    [shownColumnRelations, storage]
  );

  return {
    isLoading,
    isFetched,
    view,
    placeholder,
    viewRelation,
    setView,
    shownColumnIds,
    shownColumnRelations,
    orderedShownColumnRelations,
    toggleProperty,
    hideAllShownPropertyColumns,
    reorderShownPropertyRelations,
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
