import { ID } from '~/core/id';
import { AGGREGATED_RANKINGS_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

export type LeaderboardEntry = {
  entityId: string;
  rank: number;
};

/**
 * Orders ranking relation positions the way the ranking indexer does: by character code, with
 * missing positions last. The SDK writes ballot positions with jittered fractional keys that mix
 * upper and lower case (`a05Fl`, `a0a…`), and those keys sort correctly only by character code.
 * `Position.compare` uses `localeCompare`, which puts `a0a` before `a0Z`, so a ballot past about a
 * dozen votes read back with it came out in a different order from the one published and scored.
 */
export function compareRankingPositions(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

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
        ID.equals(relation.spaceId, spaceId) &&
        ID.equals(relation.fromEntity.id, blockId) &&
        ID.equals(relation.type.id, propertyId) &&
        Boolean(relation.toEntity.id)
    )
    .sort((a, b) => compareRankingPositions(a.position, b.position))
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
        ID.equals(relation.spaceId, spaceId) &&
        ID.equals(relation.fromEntity.id, blockId) &&
        ID.equals(relation.type.id, AGGREGATED_RANKINGS_PROPERTY_ID)
    )
    .sort((a, b) => compareRankingPositions(a.position, b.position));
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
