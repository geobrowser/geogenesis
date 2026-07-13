import { Position, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Entity, Relation } from '~/core/types';

import { DEFAULT_DATA_BLOCK_PAGE_SIZE } from './block-ontology-ids';
import { readBlockPageSizeFromValues } from './parse-block-page-size';

type Options = {
  blockRelations?: Relation[];
  spaceId?: string;
};

function resolvePageSizeForBlock(
  blockId: string,
  entitiesById: Map<string, Entity>,
  blockRelations: Relation[] | undefined,
  spaceId: string | undefined
): number {
  if (!blockRelations?.length || !spaceId) return DEFAULT_DATA_BLOCK_PAGE_SIZE;

  const placement = blockRelations.find(relation => relation.toEntity.id === blockId && !relation.isDeleted);
  if (!placement?.entityId) return DEFAULT_DATA_BLOCK_PAGE_SIZE;

  const relationEntity = entitiesById.get(placement.entityId);
  return readBlockPageSizeFromValues(relationEntity?.values, spaceId, DEFAULT_DATA_BLOCK_PAGE_SIZE);
}

export function getCollectionItemIds(blocks: Entity[], options?: Options): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const entitiesById = new Map(blocks.map(block => [block.id, block]));

  for (const block of blocks) {
    const isCollectionDataBlock = block.relations.some(
      r =>
        r.type.id === SystemIds.DATA_SOURCE_TYPE_RELATION_TYPE &&
        r.toEntity.id === SystemIds.COLLECTION_DATA_SOURCE &&
        !r.isDeleted
    );

    if (!isCollectionDataBlock) continue;

    const pageSize = resolvePageSizeForBlock(block.id, entitiesById, options?.blockRelations, options?.spaceId);

    const collectionItemRelations = block.relations
      .filter(
        r => r.fromEntity.id === block.id && r.type.id === SystemIds.COLLECTION_ITEM_RELATION_TYPE && !r.isDeleted
      )
      .sort((a, z) => Position.compare(a.position ?? null, z.position ?? null));

    const entityIds = collectionItemRelations.slice(0, pageSize).map(r => r.toEntity.id);

    if (entityIds.length > 0) {
      result[block.id] = entityIds;
    }
  }

  return result;
}
