import { Position } from '@geoprotocol/geo-sdk/lite';

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
