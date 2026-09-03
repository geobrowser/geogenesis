'use client';

import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import equal from 'fast-deep-equal';

import { ID } from '~/core/id';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reactiveRelations } from '~/core/sync/store';
import { useMutate } from '~/core/sync/use-mutate';
import { store } from '~/core/sync/use-sync-engine';
import { Relation } from '~/core/types';

import { DATA_BLOCK_DROPDOWNS_PROPERTY_ID } from './block-ontology-ids';
import { useDataBlockInstance } from './use-data-block';

export type BlockDropdownConfig = {
  /** The property (column) id this dropdown filters on. */
  propertyId: string;
  /** Property name for the pill label; null until resolved. */
  propertyName: string | null;
};

function isDropdownRelation(relation: Relation): boolean {
  return !relation.isDeleted && ID.equals(relation.type.id, DATA_BLOCK_DROPDOWNS_PROPERTY_ID);
}

/**
 * Browse-mode dropdown config for a data block. Lives as `Dropdowns` relations
 * on the block's BLOCKS-relation entity, parallel to the `Properties` relations
 * that drive shown columns: each to-entity is a property offered as a personal
 * filter dropdown. Read path mirrors `useBlockTools`; the writer mirrors
 * `useView.toggleProperty`.
 */
export function useBlockDropdowns() {
  const { entityId, relationId, spaceId } = useDataBlockInstance();
  const { blockRelations } = useEditorStoreLite();
  const { storage } = useMutate();

  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  const { dropdownRelations, blockRelationName } = useSelector(
    reactiveRelations,
    () => {
      if (!blocksRelationEntityId) {
        return { dropdownRelations: [] as Relation[], blockRelationName: null as string | null };
      }
      return {
        dropdownRelations: store.getResolvedRelations(blocksRelationEntityId).filter(isDropdownRelation),
        blockRelationName: store.getEntity(blocksRelationEntityId)?.name ?? null,
      };
    },
    equal
  );

  const dropdowns: BlockDropdownConfig[] = React.useMemo(() => {
    const ordered = [...dropdownRelations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
    const seen = new Set<string>();
    const configs: BlockDropdownConfig[] = [];
    for (const relation of ordered) {
      const propertyId = relation.toEntity.id;
      if (seen.has(propertyId)) continue;
      seen.add(propertyId);
      configs.push({ propertyId, propertyName: relation.toEntity.name ?? null });
    }
    return configs;
  }, [dropdownRelations]);

  const toggleDropdownProperty = React.useCallback(
    (property: { id: string; name: string | null }) => {
      if (!blocksRelationEntityId) return;

      const existing = dropdownRelations.filter(r => ID.equals(r.toEntity.id, property.id));
      if (existing.length > 0) {
        for (const relation of existing) storage.relations.delete(relation);
        return;
      }

      const sorted = [...dropdownRelations].sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
      const last = sorted.at(-1)?.position ?? null;

      storage.relations.set({
        id: IdUtils.generate(),
        entityId: IdUtils.generate(),
        spaceId: spaceId,
        position: Position.generateBetween(last, null),
        renderableType: 'RELATION',
        type: {
          id: DATA_BLOCK_DROPDOWNS_PROPERTY_ID,
          name: 'Dropdowns',
        },
        fromEntity: {
          id: blocksRelationEntityId,
          name: blockRelationName,
        },
        toEntity: {
          id: property.id,
          name: property.name,
          value: property.id,
        },
      });
    },
    [blockRelationName, blocksRelationEntityId, dropdownRelations, spaceId, storage]
  );

  return {
    blocksRelationEntityId,
    dropdowns,
    toggleDropdownProperty,
  };
}
