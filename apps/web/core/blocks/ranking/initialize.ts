import { EntityId } from '~/core/io/substream-schema';
import { RANKING_BLOCK_TYPE_ID, RANKING_BLOCK_TYPE_NAME } from '~/core/ranking-block-ids';
import { getRelationForBlockType } from '~/core/state/editor/block-types';
import { Relation } from '~/core/types';

import { type Source, makeRelationForSourceType } from '../data/source';
import { makeRankingAggregationRestrictionRelation } from './ensure-ranking-aggregation-restriction';

/**
 * Ranking blocks use query-style scope encoded in Filter + optional GEO source relation.
 */
export function makeInitialRankingBlockRelations(
  blockId: EntityId,
  spaceId: string,
  initialSource: Extract<Source['type'], 'GEO' | 'SPACES'> = 'GEO'
): Relation[] {
  const sourceType: Source['type'] = initialSource === 'SPACES' ? 'SPACES' : 'GEO';

  return [
    makeRelationForSourceType(sourceType, blockId, spaceId),
    getRelationForBlockType(blockId, RANKING_BLOCK_TYPE_ID, spaceId, RANKING_BLOCK_TYPE_NAME),
    makeRankingAggregationRestrictionRelation(blockId, spaceId),
  ];
}
