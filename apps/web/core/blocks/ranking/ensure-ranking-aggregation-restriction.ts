import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';

import { EntityId } from '~/core/io/substream-schema';
import {
  RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_ID,
  RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_NAME,
  RANKING_AGGREGATION_RESTRICTION_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

export function makeRankingAggregationRestrictionRelation(blockId: string, spaceId: string): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: {
      id: EntityId(RANKING_AGGREGATION_RESTRICTION_PROPERTY_ID),
      name: 'Aggregation restriction',
    },
    toEntity: {
      id: EntityId(RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_ID),
      name: RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_NAME,
      value: RANKING_AGGREGATION_RESTRICTION_MEMBERS_AND_EDITORS_ID,
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

export function ensureRankingAggregationRestriction({
  storage,
  blockId,
  spaceId,
  relations,
}: {
  storage: Mutator;
  blockId: string;
  spaceId: string;
  relations: Relation[];
}) {
  const hasRestriction = relations.some(
    r =>
      r.fromEntity.id === blockId &&
      r.type.id === RANKING_AGGREGATION_RESTRICTION_PROPERTY_ID &&
      r.spaceId === spaceId &&
      !r.isDeleted
  );

  if (hasRestriction) return;

  storage.relations.set(makeRankingAggregationRestrictionRelation(blockId, spaceId));
}
