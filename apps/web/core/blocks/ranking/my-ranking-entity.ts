import { ID } from '~/core/id';
import { RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Relation } from '~/core/types';

import { getOrderedRelationTargetIds } from './ranking-block-relations';

export function isRankSubmittedToBlock(rankEntity: Entity, authorSpaceId: string, blockEntityId: string): boolean {
  return rankEntity.relations.some(
    relation =>
      !relation.isDeleted &&
      ID.equals(relation.spaceId, authorSpaceId) &&
      ID.equals(relation.fromEntity.id, rankEntity.id) &&
      ID.equals(relation.type.id, SUBMITTED_TO_PROPERTY_ID) &&
      ID.equals(relation.toEntity.id, blockEntityId)
  );
}

type BlockSubmittedToRelation = {
  isDeleted?: boolean;
  spaceId: string;
  fromEntityId?: string;
  fromEntity?: { id: string };
  toEntityId?: string;
  toEntity?: { id: string };
  type?: { id: string };
};

/** SUBMITTED_TO relations loaded from the block (to-entity) side. */
export function isRankSubmittedToBlockFromBlockLookup(
  rankEntityId: string,
  authorSpaceId: string,
  blockEntityId: string,
  submittedToRelations: BlockSubmittedToRelation[]
): boolean {
  return submittedToRelations.some(relation => {
    if (relation.isDeleted) return false;
    const fromId = relation.fromEntity?.id ?? relation.fromEntityId;
    const toId = relation.toEntity?.id ?? relation.toEntityId;
    if (!fromId || !toId) return false;
    if (relation.type && !ID.equals(relation.type.id, SUBMITTED_TO_PROPERTY_ID)) return false;
    return (
      ID.equals(relation.spaceId, authorSpaceId) && ID.equals(fromId, rankEntityId) && ID.equals(toId, blockEntityId)
    );
  });
}

/**
 * Resolve the data/ranking block a rank entity was submitted to from its
 * relations. A RANK entity carries a single SUBMITTED_TO relation (scoped to the
 * author's personal space) pointing at the block it ranks. Shared with the short
 * share-link resolver so the block-detection logic lives in one place.
 */
export function getSubmittedBlockIdFromRank(relations: Relation[], authorSpaceId: string): string | null {
  const relation = relations.find(
    r => !r.isDeleted && ID.equals(r.spaceId, authorSpaceId) && ID.equals(r.type.id, SUBMITTED_TO_PROPERTY_ID)
  );
  return relation?.toEntity.id ?? null;
}

function parseEntityTimestampMs(raw: string | number | undefined | null): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') {
    return raw < 1_000_000_000_000 ? raw * 1000 : raw;
  }
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber)) {
    return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function pickMostRecentlyUpdatedRankingEntity(entities: Entity[]): Entity | null {
  if (entities.length === 0) return null;

  return entities.reduce<Entity | null>((latest, entity) => {
    if (!latest) return entity;
    const latestTs = parseEntityTimestampMs(latest.updatedAt);
    const entityTs = parseEntityTimestampMs(entity.updatedAt);
    return entityTs >= latestTs ? entity : latest;
  }, null);
}

export function getMyRankingOrderedEntityIds(
  rankEntityId: string,
  relations: Relation[],
  personalSpaceId: string
): string[] {
  return getOrderedRelationTargetIds(relations, rankEntityId, RANK_VOTES_RELATION_TYPE_ID, personalSpaceId);
}
