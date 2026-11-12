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
import type { BallotSnapshot } from './ranking-publish-queue';
import { parseTimestampMs } from './ranking-rolling';

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

/** Relations the block listing returns per entity (`relationsList(first: 1000)`). */
const LISTING_RELATIONS_LIMIT = 1000;

export const RANKING_BALLOT_UNREADABLE_MESSAGE =
  "We couldn't load your whole ranking just now, so nothing was changed. Reload the page and try again.";

/** The ballot is listed but can't be read whole: the full read fails and the
 *  listing's copy may be truncated. Publishing on top of it could drop items,
 *  so the publish path stops and the screens say so. */
export class RankingBallotUnreadableError extends Error {
  readonly _tag = 'RankingBallotUnreadableError';
  constructor(readonly rankId: string) {
    super(RANKING_BALLOT_UNREADABLE_MESSAGE);
    this.name = 'RankingBallotUnreadableError';
  }
}

export function isRankingBallotUnreadableError(error: unknown): error is RankingBallotUnreadableError {
  return error instanceof RankingBallotUnreadableError;
}

/** A ballot as `classifyReadBack` compares it. */
export function ballotSnapshot(ballot: MyRankingBallot): BallotSnapshot {
  return {
    rankId: ballot.rankEntity?.id ?? null,
    orderedEntityIds: ballot.orderedEntityIds,
    updatedAtMs: ballot.rankEntity ? parseTimestampMs(ballot.rankEntity.updatedAt) || null : null,
    createdAtMs: ballot.rankEntity ? parseTimestampMs(ballot.rankEntity.createdAt) || null : null,
  };
}

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
    // Listed but the full read returns nothing (it can fail to decode where the
    // listing doesn't). The listing's own votes are whole as long as its
    // relations stopped short of the cap; past it, they may be truncated.
    if ((listed.relations?.length ?? 0) < LISTING_RELATIONS_LIMIT) {
      return { rankEntity: listed, orderedEntityIds: getMyRankingOrderedEntityIds(listed, personalSpaceId) };
    }
    throw new RankingBallotUnreadableError(listed.id);
  }
  // `createdAt` (the rolling clock) only comes with the listing.
  return {
    rankEntity: { ...full.rankEntity, createdAt: listed.createdAt ?? full.rankEntity.createdAt },
    orderedEntityIds: full.orderedEntityIds,
  };
}
