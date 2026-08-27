import type { EntityFilter } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { RANK_TYPE_ID, RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Relation } from '~/core/types';

import { getOrderedRelationTargetIds } from './ranking-block-relations';

export function buildMyRankingEntityFilter(blockId: string): EntityFilter {
  return {
    relations: {
      some: {
        typeId: { is: SUBMITTED_TO_PROPERTY_ID },
        toEntityId: { is: blockId },
      },
    },
  };
}

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

/**
 * The current ballot is the most recently *created* rank entity: re-submission
 * after a rolling window elapses mints a fresh entity, while in-window edits
 * update the existing one in place (bumping `updatedAt` but not `createdAt`).
 * Picking by `updatedAt` could resurface a superseded ballot that was merely
 * touched after a newer one was minted. `updatedAt` is only a fallback for
 * older entities indexed without a `createdAt`.
 */
export function pickMostRecentlyCreatedRankingEntity(entities: Entity[]): Entity | null {
  if (entities.length === 0) return null;

  return entities.reduce<Entity | null>((latest, entity) => {
    if (!latest) return entity;
    const latestTs = parseEntityTimestampMs(latest.createdAt ?? latest.updatedAt);
    const entityTs = parseEntityTimestampMs(entity.createdAt ?? entity.updatedAt);
    return entityTs >= latestTs ? entity : latest;
  }, null);
}

export function getMyRankingOrderedEntityIds(rankEntity: Entity, personalSpaceId: string): string[] {
  return getOrderedRelationTargetIds(
    rankEntity.relations ?? [],
    rankEntity.id,
    RANK_VOTES_RELATION_TYPE_ID,
    personalSpaceId
  );
}
