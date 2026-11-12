import { Effect } from 'effect';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { getAllEntities, getEntity } from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import {
  buildMyRankingEntityFilter,
  getMyRankingOrderedEntityIds,
  pickMostRecentlyCreatedRankingEntity,
} from './my-ranking-entity';

/*
 * Reads of the author's published ballot (GEO-3680). Kept free of React so the
 * publish path, `useMyRanking` and the testnet size script share one read.
 *
 * The votes always come from the paged single-entity read (`getEntity` drains
 * every relations page). The block listing selects `relationsList(first: 1000)`
 * per entity, shared with the rank's own SUBMITTED_TO/Types relations, so it
 * can't see a ballot past about 998 items; building an edit from it would drop
 * the tail.
 */

export type MyRankingBallot = { rankEntity: Entity | null; orderedEntityIds: string[] };

/** One rank's full ballot, every vote. `null` when the index doesn't hold the
 *  rank yet. Carries `updatedAt` but not `createdAt` (the entity query doesn't
 *  select it). */
export async function fetchRankBallot(rankId: string, personalSpaceId: string): Promise<MyRankingBallot | null> {
  const rankEntity = await Effect.runPromise(getEntity(rankId, personalSpaceId));
  if (!rankEntity) return null;
  return { rankEntity, orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity, personalSpaceId) };
}

/**
 * The author's current ballot for a block, straight from the index (no pin, no
 * cache): the newest-created rank from the block listing, with its votes read
 * whole from the rank itself.
 */
export async function fetchMyRankingBallot(personalSpaceId: string, blockId: string): Promise<MyRankingBallot> {
  const { entities } = await Effect.runPromise(
    getAllEntities({
      spaceId: personalSpaceId,
      typeId: RANK_TYPE_ID,
      filter: buildMyRankingEntityFilter(blockId),
      orderBy: [EntitiesOrderBy.CreatedAtDesc],
      limit: 100,
    })
  );

  const listed = pickMostRecentlyCreatedRankingEntity(entities);
  if (!listed) return { rankEntity: null, orderedEntityIds: [] };

  const full = await fetchRankBallot(listed.id, personalSpaceId);
  if (!full?.rankEntity) {
    // Listed but not readable on its own yet; can't vouch for its votes.
    throw new Error(`Ranking ${listed.id} is listed but could not be read`);
  }
  // `createdAt` (the rolling clock) only comes with the listing.
  return {
    rankEntity: { ...full.rankEntity, createdAt: listed.createdAt ?? full.rankEntity.createdAt },
    orderedEntityIds: full.orderedEntityIds,
  };
}
