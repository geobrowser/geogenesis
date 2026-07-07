import { arrayMove } from '@dnd-kit/sortable';
import { IdUtils, Position, SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reactiveRelations } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { useQueryEntity } from '~/core/sync/use-store';
import { store } from '~/core/sync/use-sync-engine';
import { Entity, Relation } from '~/core/types';
import { getImagePath } from '~/core/utils/utils';

import {
  columnPropertyIdFromRelation,
  dedupeRelationsByColumnProperty,
  isShownColumnRelation,
  relationsMatchingColumnProperty,
} from './shown-column-relations';
import { useDataBlockInstance } from './use-data-block';
import { useMapping } from './use-mapping';

export { columnPropertyIdFromRelation } from './shown-column-relations';

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

  const { blockRelations } = useEditorStoreLite();
  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  // Read shown-column / view config from the reactive sync store only
  const { blockRelationRelations, blockRelationName } = useSelector(
    reactiveRelations,
    () => {
      if (!blocksRelationEntityId) {
        return { blockRelationRelations: [] as Relation[], blockRelationName: null as string | null };
      }
      return {
        blockRelationRelations: store.getResolvedRelations(blocksRelationEntityId),
        blockRelationName: store.getEntity(blocksRelationEntityId)?.name ?? null,
      };
    },
    equal
  );

  const viewRelation = React.useMemo(() => selectViewRelation(blockRelationRelations), [blockRelationRelations]);

  const shownColumnRelations = React.useMemo(
    () => dedupeRelationsByColumnProperty(blockRelationRelations.filter(isShownColumnRelation)),
    [blockRelationRelations]
  );

  const orderedShownColumnRelations = React.useMemo(
    () => [...shownColumnRelations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null)),
    [shownColumnRelations]
  );

  const { mapping: rawMapping, isLoading } = useMapping(
    entityId,
    orderedShownColumnRelations.map(r => r.id)
  );

  const allowedMappingPropertyIds = React.useMemo(
    () => new Set([SystemIds.NAME_PROPERTY, ...shownColumnRelations.map(columnPropertyIdFromRelation)]),
    [shownColumnRelations]
  );

  const mapping = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(rawMapping).filter(([propertyId]) => allowedMappingPropertyIds.has(propertyId))
      ),
    [rawMapping, allowedMappingPropertyIds]
  );

  const shownColumnIds = [SystemIds.NAME_PROPERTY, ...orderedShownColumnRelations.map(columnPropertyIdFromRelation)];

  const view = getView(viewRelation);
  const placeholder = getPlaceholder(blockEntity, view);

  /** Append new shown columns after existing ones (avoid `Position.generate()` random order). */
  const nextPropertiesColumnPosition = React.useCallback((): string | undefined => {
    const sorted = [...shownColumnRelations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
    const last = sorted[sorted.length - 1]?.position;
    const lastStr = typeof last === 'string' && last.length > 0 ? last : null;
    const generated = Position.generateBetween(lastStr, null);
    return generated ?? undefined;
  }, [shownColumnRelations]);

  const setView = React.useCallback(
    async (newView: DataBlockViewDetails) => {
      if (newView.value === view || !blocksRelationEntityId) return;

      const activeViewRelations = blockRelationRelations.filter(
        r => r.type.id === SystemIds.VIEW_PROPERTY && !r.isDeleted
      );
      const primary = selectViewRelation(blockRelationRelations);

      // Delete the old view relation and create a fresh one instead of mutating
      // toEntity in place: publishing re-emits a non-deleted relation as a
      // createRelation with its original id, so an in-place target change re-creates
      // an already-committed relation and the backend ignores it.
      for (const rel of activeViewRelations) {
        storage.relations.delete(rel);
      }

      storage.relations.set({
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId,
        position: primary?.position ?? Position.generate(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.VIEW_PROPERTY,
          name: 'View',
        },
        fromEntity: {
          id: blocksRelationEntityId,
          name: null,
        },
        toEntity: {
          id: newView.id,
          name: newView.name,
          value: newView.id,
        },
      });
    },
    [blockRelationRelations, blocksRelationEntityId, spaceId, storage, view]
  );

  const purgeColumnConfigRelations = (propertyId: string) => {
    for (const rel of relationsMatchingColumnProperty(blockRelationRelations, propertyId)) {
      storage.relations.delete(rel);
    }
  };

  const toggleProperty = (newColumn: Column, selector?: string) => {
    const propertyId = EntityId(newColumn.id);
    const matchingShownRelations = relationsMatchingColumnProperty(blockRelationRelations, propertyId).filter(
      r => !r.isDeleted
    );
    const isShown = matchingShownRelations.length > 0;
    const shownColumnRelation = matchingShownRelations[0];

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

        purgeColumnConfigRelations(propertyId);
        storage.relations.set({
          id: newId,
          entityId: newRelationEntityId,
          spaceId: spaceId,
          position: nextPropertiesColumnPosition(),
          renderableType: 'RELATION',
          type: {
            id: SystemIds.PROPERTIES,
            name: 'Properties',
          },
          fromEntity: {
            id: blocksRelationEntityId,
            name: blockRelationName,
          },
          toEntity: {
            id: newColumn.id,
            name: newColumn.name,
            value: newColumn.id,
          },
        });
      }

      purgeColumnConfigRelations(propertyId);

      return;
    }

    if (!isShown) {
      purgeColumnConfigRelations(propertyId);
      storage.relations.set({
        id: IdUtils.generate(),
        entityId: newRelationEntityId,
        spaceId: spaceId,
        position: nextPropertiesColumnPosition(),
        renderableType: 'RELATION',
        type: {
          id: SystemIds.PROPERTIES,
          name: 'Properties',
        },
        fromEntity: {
          id: blocksRelationEntityId,
          name: blockRelationName,
        },
        toEntity: {
          id: newColumn.id,
          name: newColumn.name,
          value: newColumn.id,
        },
      });
    } else {
      purgeColumnConfigRelations(propertyId);
    }
  };

  const hideAllShownPropertyColumns = React.useCallback(() => {
    for (const rel of blockRelationRelations.filter(isShownColumnRelation)) {
      storage.relations.delete(rel);
    }
  }, [blockRelationRelations, storage]);

  /**
   * Persist the ordering of the block's shown columns. Only repositions columns
   * that are already shown — reordering never adds or removes columns. This lets
   * surfaces that display every property (e.g. the Power Tool) reorder columns
   * without materializing shown-column relations for hidden properties, which
   * would otherwise reset the source table's property-visibility state. Name is
   * implicit (always first) and never persisted.
   */
  const setShownColumnOrder = React.useCallback(
    (columns: Column[]) => {
      if (!blocksRelationEntityId) return;

      const active = dedupeRelationsByColumnProperty(blockRelationRelations.filter(isShownColumnRelation));
      const relationByPropertyId = new Map(active.map(r => [ID.uuidToHex(columnPropertyIdFromRelation(r)), r]));

      let cursor: string | null = null;
      for (const column of columns) {
        if (ID.equals(column.id, SystemIds.NAME_PROPERTY)) continue;

        const existing = relationByPropertyId.get(ID.uuidToHex(column.id));
        if (!existing) continue;

        const position = Position.generateBetween(cursor, null);
        if (!position) continue;
        cursor = position;

        if (existing.position !== position) {
          storage.relations.update(existing, draft => {
            draft.position = position;
          });
        }
      }
    },
    [blockRelationRelations, blocksRelationEntityId, storage]
  );

  const reorderShownPropertyRelations = React.useCallback(
    (fromIndex: number, toIndex: number) => {
      const sorted = [...shownColumnRelations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
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
    isFetched: Boolean(blocksRelationEntityId),
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
    setShownColumnOrder,
    mapping,
  };
}

export type DataBlockView = 'TABLE' | 'LIST' | 'GALLERY' | 'BULLETED_LIST';

function selectViewRelation(relations: Relation[]): Relation | undefined {
  const views = relations.filter(r => r.type.id === SystemIds.VIEW_PROPERTY && !r.isDeleted);
  if (views.length === 0) return undefined;

  const pool = views.some(r => r.isLocal) ? views.filter(r => r.isLocal) : views;

  return pool.reduce<Relation | undefined>((best, relation) => {
    if (!best) return relation;
    const bestTs = best.timestamp ?? '';
    const nextTs = relation.timestamp ?? '';
    return nextTs >= bestTs ? relation : best;
  }, undefined);
}

const getView = (viewRelation: Relation | undefined): DataBlockView => {
  if (!viewRelation) return 'TABLE';

  const targetId = viewRelation.toEntity.id;
  if (ID.equals(targetId, SystemIds.TABLE_VIEW)) return 'TABLE';
  if (ID.equals(targetId, SystemIds.LIST_VIEW)) return 'LIST';
  if (ID.equals(targetId, SystemIds.GALLERY_VIEW)) return 'GALLERY';
  if (ID.equals(targetId, SystemIds.BULLETED_LIST_VIEW)) return 'BULLETED_LIST';

  return 'TABLE';
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
