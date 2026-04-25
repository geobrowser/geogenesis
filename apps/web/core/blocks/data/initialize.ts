import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { makeRelationForSourceType, type Source } from '~/core/blocks/data/source';
import { EntityId } from '~/core/io/substream-schema';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { Relation } from '~/core/types';

export type InitialDataBlockSource = Extract<Source['type'], 'COLLECTION' | 'SPACES' | 'GEO'>;

/**
 * Returns the relations to create a data entity. Data entities require a type,
 * source type, and source relations by default to be valid.
 *
 * @param blockId the id of the new data block as an {@link EntityId}
 * @param initialSourceType collection vs query source (`SPACES`, `GEO`, etc.)
 * @returns an array of {@link StoreRelation} representing the data entity relations.
 */
export function makeInitialDataEntityRelations(
  blockId: EntityId,
  spaceId: string,
  initialSourceType: InitialDataBlockSource = 'COLLECTION'
): [Relation, Relation] {
  const sourceForRelation: Source['type'] =
    initialSourceType === 'COLLECTION'
      ? 'COLLECTION'
      : initialSourceType === 'GEO'
        ? 'GEO'
        : 'SPACES';

  return [
    makeRelationForSourceType(sourceForRelation, blockId, spaceId),
    getRelationForBlockType(blockId, SystemIds.DATA_BLOCK, spaceId),
  ];
}
