import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Entity } from '~/core/types';

const COLLECTION_PAGE_SIZE = 9;

export function getCollectionItemIds(blocks: Entity[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const block of blocks) {
    const isCollectionDataBlock = block.relations.some(
      r =>
        r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
        r.toEntity.id === SystemIds.COLLECTION_DATA_SOURCE &&
        !r.isDeleted
    );

    if (!isCollectionDataBlock) continue;

    const collectionItemRelations = block.relations
      .filter(
        r => r.fromEntity.id === block.id && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE && !r.isDeleted
      )
      .sort((a, z) => Position.compare(a.position ?? null, z.position ?? null));

    const entityIds = collectionItemRelations.slice(0, COLLECTION_PAGE_SIZE).map(r => r.toEntity.id);

    if (entityIds.length > 0) {
      result[block.id] = entityIds;
    }
  }

  return result;
}
