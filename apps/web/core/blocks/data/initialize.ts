import { SYSTEM_IDS } from '@geogenesis/sdk';

import { makeRelationForSourceType } from '~/core/blocks/data/source';
import { StoreRelation } from '~/core/database/types';
import { EntityId } from '~/core/io/schema';
import { getRelationForBlockType } from '~/core/state/editor/block-types';

/**
 * Returns the relations to create a data entity. Data entities require a type,
 * source type, and source relations by default to be valid.
 *
 * This function returns all the relations needed to make a data entity, defaulting
 * to a source type of Collection. The initial source points to a new collection
 * created for the new data entity.
 *
 * @param blockId the id of the new data block as an {@link EntityId}
 * @returns an array of {@link StoreRelation} representing the data entity relations.
 */
export function makeInitialDataEntityRelations(blockId: EntityId, spaceId: string): [StoreRelation, StoreRelation] {
  return [
    // Create relation for the source type, e.g., Spaces, Collection, Geo, etc.
    makeRelationForSourceType('COLLECTION', blockId, spaceId),

    // Create the type relation for the block itself. e.g., Table, Image, Text, etc.
    getRelationForBlockType(blockId, SYSTEM_IDS.DATA_BLOCK, spaceId),
  ];
}
