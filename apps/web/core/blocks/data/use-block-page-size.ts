import * as React from 'react';

import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useValues } from '~/core/sync/use-store';

import { DATA_BLOCK_PAGE_SIZE_PROPERTY_ID, DEFAULT_DATA_BLOCK_PAGE_SIZE } from './block-ontology-ids';
import { parseBlockPageSize, readBlockPageSizeFromValues } from './parse-block-page-size';
import { useDataBlockInstance } from './use-data-block';

export function useBlockPageSize() {
  const { entityId, spaceId, relationId } = useDataBlockInstance();
  const { blockRelations, initialBlockEntities } = useEditorStoreLite();

  const blocksRelationEntityId = relationId || blockRelations.find(r => r.toEntity.id === entityId)?.entityId || '';

  const initialBlockRelationEntity = React.useMemo(() => {
    if (!blocksRelationEntityId) return null;
    return initialBlockEntities.find(entity => entity.id === blocksRelationEntityId) ?? null;
  }, [blocksRelationEntityId, initialBlockEntities]);

  const pageSizeValues = useValues({
    selector: value =>
      value.entity.id === blocksRelationEntityId &&
      value.property.id === DATA_BLOCK_PAGE_SIZE_PROPERTY_ID &&
      value.spaceId === spaceId,
  });

  return React.useMemo(() => {
    if (pageSizeValues.length > 0) {
      const chosen = pageSizeValues.find(value => value.isLocal) ?? pageSizeValues[0];
      return parseBlockPageSize(chosen.value);
    }

    return readBlockPageSizeFromValues(initialBlockRelationEntity?.values, spaceId, DEFAULT_DATA_BLOCK_PAGE_SIZE);
  }, [initialBlockRelationEntity?.values, pageSizeValues, spaceId]);
}
