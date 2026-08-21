import * as React from 'react';

import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useValues } from '~/core/sync/use-store';

import { DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID } from './block-ontology-ids';
import { parseBlockInfiniteScroll, readBlockInfiniteScrollFromValues } from './parse-block-infinite-scroll';
import { useDataBlockInstance } from './use-data-block';

/**
 * Reads the Infinite scroll BOOLEAN from the Blocks relation entity
 * (same entity that holds View and Properties).
 */
export function useBlockInfiniteScroll(): boolean {
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const { blockRelations, initialBlockEntities } = useEditorStoreLite();

  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  const initialBlockRelationEntity = React.useMemo(() => {
    if (!blocksRelationEntityId) return null;
    return initialBlockEntities.find(entity => entity.id === blocksRelationEntityId) ?? null;
  }, [blocksRelationEntityId, initialBlockEntities]);

  const infiniteScrollValues = useValues({
    selector: value =>
      value.entity.id === blocksRelationEntityId &&
      value.property.id === DATA_BLOCK_INFINITE_SCROLL_PROPERTY_ID &&
      value.spaceId === spaceId,
  });

  return React.useMemo(() => {
    if (infiniteScrollValues.length > 0) {
      const chosen = infiniteScrollValues.find(value => value.isLocal) ?? infiniteScrollValues[0];
      return parseBlockInfiniteScroll(chosen.value);
    }

    return readBlockInfiniteScrollFromValues(initialBlockRelationEntity?.values, spaceId);
  }, [initialBlockRelationEntity?.values, infiniteScrollValues, spaceId]);
}
