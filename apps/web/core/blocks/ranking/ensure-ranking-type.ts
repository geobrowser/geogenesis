import { IdUtils, Position } from '@geoprotocol/geo-sdk/lite';

import { ID } from '~/core/id';
import { EntityId } from '~/core/io/substream-schema';
import {
  RANKING_TYPE_PROPERTY_ID,
  RANKING_TYPE_PROPERTY_NAME,
  ROLLING_RANKING_TYPE_ID,
  ROLLING_RANKING_TYPE_NAME,
} from '~/core/ranking-block-ids';
import type { Mutator } from '~/core/sync/use-mutate';
import type { Relation } from '~/core/types';

export function makeRollingRankingTypeRelation(blockId: string, spaceId: string): Relation {
  return {
    id: IdUtils.generate(),
    entityId: IdUtils.generate(),
    spaceId,
    position: Position.generate(),
    renderableType: 'RELATION',
    type: {
      id: EntityId(RANKING_TYPE_PROPERTY_ID),
      name: RANKING_TYPE_PROPERTY_NAME,
    },
    toEntity: {
      id: EntityId(ROLLING_RANKING_TYPE_ID),
      name: ROLLING_RANKING_TYPE_NAME,
      value: ROLLING_RANKING_TYPE_ID,
    },
    fromEntity: {
      id: EntityId(blockId),
      name: null,
    },
  };
}

export function isRollingRankingBlock(relations: Relation[], blockId: string, spaceId: string): boolean {
  return relations.some(
    r =>
      !r.isDeleted &&
      ID.equals(r.spaceId, spaceId) &&
      ID.equals(r.fromEntity.id, blockId) &&
      ID.equals(r.type.id, RANKING_TYPE_PROPERTY_ID) &&
      ID.equals(r.toEntity.id, ROLLING_RANKING_TYPE_ID)
  );
}

function findRollingRankingTypeRelation(relations: Relation[], blockId: string, spaceId: string): Relation | undefined {
  return relations.find(
    r =>
      !r.isDeleted &&
      ID.equals(r.spaceId, spaceId) &&
      ID.equals(r.fromEntity.id, blockId) &&
      ID.equals(r.type.id, RANKING_TYPE_PROPERTY_ID) &&
      ID.equals(r.toEntity.id, ROLLING_RANKING_TYPE_ID)
  );
}

export function ensureRankingTypeRelation({
  storage,
  blockId,
  spaceId,
  relations,
  isRolling,
}: {
  storage: Mutator;
  blockId: string;
  spaceId: string;
  relations: Relation[];
  isRolling: boolean;
}) {
  const existing = findRollingRankingTypeRelation(relations, blockId, spaceId);

  if (isRolling) {
    if (!existing) storage.relations.set(makeRollingRankingTypeRelation(blockId, spaceId));
    return;
  }

  if (existing) storage.relations.delete(existing);
}
