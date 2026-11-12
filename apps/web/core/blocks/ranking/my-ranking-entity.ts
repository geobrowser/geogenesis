import type { EntityFilter } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Relation } from '~/core/types';

import { ballotRecencyKey, pickLatestBallot } from './ranking-ballot-recency';
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

/**
 * The current ballot is the most recently *created* rank entity: re-submission
 * after a rolling window elapses mints a fresh entity, while in-window edits
 * update the existing one in place (bumping `updatedAt` but not `createdAt`).
 * Picking by `updatedAt` could resurface a superseded ballot that was merely
 * touched after a newer one was minted. `updatedAt` is only a fallback for
 * older entities indexed without a `createdAt`, and a tie-break.
 *
 * The rule lives in `ranking-ballot-recency.ts`, shared with the ranker counts
 * so every screen agrees on which ballot is yours.
 */
export function pickMostRecentlyCreatedRankingEntity(entities: Entity[]): Entity | null {
  return pickLatestBallot(entities, entity => ballotRecencyKey(entity.id, entity.createdAt, entity.updatedAt));
}

export function getMyRankingOrderedEntityIds(rankEntity: Entity, personalSpaceId: string): string[] {
  return getOrderedRelationTargetIds(
    rankEntity.relations ?? [],
    rankEntity.id,
    RANK_VOTES_RELATION_TYPE_ID,
    personalSpaceId
  );
}
