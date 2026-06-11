import { Position } from '@geoprotocol/geo-sdk/lite';

import { AGGREGATED_RANKINGS_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

export type LeaderboardEntry = {
  entityId: string;
  rank: number;
};

export function getOrderedRelationTargetIds(
  relations: Relation[],
  blockId: string,
  propertyId: string,
  spaceId: string
): string[] {
  const seen = new Set<string>();

  return relations
    .filter(
      relation =>
        !relation.isDeleted &&
        relation.spaceId === spaceId &&
        relation.fromEntity.id === blockId &&
        relation.type.id === propertyId &&
        Boolean(relation.toEntity.id)
    )
    .sort((a, b) => Position.compare(a.position ?? null, b.position ?? null))
    .reduce<string[]>((ids, relation) => {
      const id = relation.toEntity.id;
      if (seen.has(id)) return ids;
      seen.add(id);
      ids.push(id);
      return ids;
    }, []);
}

export function buildLeaderboardFromOrderedEntityIds(entityIds: string[]): LeaderboardEntry[] {
  return entityIds.map((entityId, index) => ({
    entityId,
    rank: index + 1,
  }));
}

function aggregatedRankingRelations(relations: Relation[], blockId: string, spaceId: string): Relation[] {
  return relations
    .filter(
      relation =>
        !relation.isDeleted &&
        relation.spaceId === spaceId &&
        relation.fromEntity.id === blockId &&
        relation.type.id === AGGREGATED_RANKINGS_PROPERTY_ID
    )
    .sort((a, b) => Position.compare(a.position ?? null, b.position ?? null));
}

/** Total submitted rankings — one relation per ballot on Aggregated rankings. */
export function getAggregatedRankingSubmissionCount(relations: Relation[], blockId: string, spaceId: string): number {
  return aggregatedRankingRelations(relations, blockId, spaceId).length;
}

export type AggregatedRankingSubmitterRef = {
  rankEntityId: string;
  spaceId?: string;
};

export function getAggregatedRankingSubmitterRefs(
  relations: Relation[],
  blockId: string,
  spaceId: string
): AggregatedRankingSubmitterRef[] {
  return aggregatedRankingRelations(relations, blockId, spaceId)
    .map(relation => ({
      rankEntityId: relation.toEntity.id,
      spaceId: relation.toSpaceId,
    }))
    .filter(ref => Boolean(ref.rankEntityId));
}

/** Personal spaces that submitted rankings (`to_space` on each Aggregated rankings relation). */
export function getAggregatedRankingSubmitterSpaceIds(
  relations: Relation[],
  blockId: string,
  spaceId: string
): string[] {
  return getAggregatedRankingSubmitterRefs(relations, blockId, spaceId)
    .map(ref => ref.spaceId)
    .filter((id): id is string => Boolean(id));
}
