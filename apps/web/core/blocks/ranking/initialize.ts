import { EntityId } from '~/core/io/substream-schema';
import { RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME } from '~/core/ranking-block-ids';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { Relation } from '~/core/types';

import { makeRankingAggregationRestrictionRelation } from './ensure-ranking-aggregation-restriction';

export function makeInitialRankingBlockRelations(blockId: EntityId, spaceId: string): Relation[] {
  return [
    getRelationForBlockType(blockId, RANKING_BLOCK_TYPE_ID, spaceId, RANKING_BLOCK_TYPE_NAME),
    makeRankingAggregationRestrictionRelation(blockId, spaceId),
  ];
}
