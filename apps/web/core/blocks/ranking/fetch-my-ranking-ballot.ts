import { Effect } from 'effect';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { getAllEntities, getEntity } from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import { BEST_DEBATES_BLOCK_ID } from './best-debates';
import { rankTypeOf } from './best-debates-ballot';
import { fetchBallotGrades } from './fetch-ballot-grades';

import {
  buildMyRankingEntityFilter,
  getMyRankingOrderedEntityIds,
  pickMostRecentlyCreatedRankingEntity,
} from './my-ranking-entity';
import type { BallotSnapshot } from './ranking-publish-queue';
import { type BallotGrades, NO_GRADES } from './ranking-grades';
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

export type MyRankingBallot = {
  rankEntity: Entity | null;
  orderedEntityIds: string[];
  /** Best debates only (GEO-3729): the ranker's grade per entry. Absent or empty everywhere else. */
  grades?: BallotGrades;
};

/** Grades are read and written on the Best debates block only. */
export function blockHasGrades(blockId: string, bestDebatesBlockId: string | null = BEST_DEBATES_BLOCK_ID): boolean {
  return Boolean(bestDebatesBlockId) && ID.equals(blockId, bestDebatesBlockId!);
}

/**
 * The ballot's grades, when it can carry them: an ORDINAL Rank (a stale non-ORDINAL Rank is never
 * built on, a fresh one is minted) with votes. Throws `BallotGradesPendingError` when the grades
 * don't line up with the votes yet.
 */
async function readGrades(rankEntity: Entity, personalSpaceId: string, orderedEntityIds: string[]) {
  if (orderedEntityIds.length === 0 || rankTypeOf(rankEntity) !== 'ORDINAL') return NO_GRADES;
  return fetchBallotGrades(rankEntity, personalSpaceId);
}

/** Relations the block listing returns per entity (`relationsList(first: 1000)`). */
const LISTING_RELATIONS_LIMIT = 1000;

export function rankingBallotUnreadableMessage(rankId: string): string {
  return `We can't read your ranking on this block. Contact support with this id: ${rankId}`;
}

/**
 * The ballot is listed but can't be read whole: the full read fails (most
 * likely a decode failure, which a retry won't fix) and the listing's copy may
 * be truncated. Publishing on top of it could drop items, so the publish path
 * stops and the screens say so, except where publishing doesn't build on it
 * (a rolled-off rolling block mints a fresh rank).
 */
export class RankingBallotUnreadableError extends Error {
  readonly _tag = 'RankingBallotUnreadableError';
  constructor(
    readonly rankId: string,
    /** The listed rank's `createdAt`, for the rolling-window check. */
    readonly rankCreatedAt: string | number | null | undefined
  ) {
    super(rankingBallotUnreadableMessage(rankId));
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
    grades: ballot.grades,
    updatedAtMs: ballot.rankEntity ? parseTimestampMs(ballot.rankEntity.updatedAt) || null : null,
    createdAtMs: ballot.rankEntity ? parseTimestampMs(ballot.rankEntity.createdAt) || null : null,
  };
}

/** One rank's full ballot, every vote. `null` when the index doesn't hold the
 *  rank yet. Carries `updatedAt` but not `createdAt` (the entity query doesn't
 *  select it). */
export async function fetchRankBallot(
  rankId: string,
  personalSpaceId: string,
  { withGrades = false }: { withGrades?: boolean } = {}
): Promise<MyRankingBallot | null> {
  const rankEntity = await Effect.runPromise(getEntity(rankId, personalSpaceId));
  if (!rankEntity) return null;
  const orderedEntityIds = getMyRankingOrderedEntityIds(rankEntity, personalSpaceId);
  const grades = withGrades ? await readGrades(rankEntity, personalSpaceId, orderedEntityIds) : NO_GRADES;
  return { rankEntity, orderedEntityIds, grades };
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
  if (!listed) return { rankEntity: null, orderedEntityIds: [], grades: NO_GRADES };

  const withGrades = blockHasGrades(blockId);
  const full = await fetchRankBallot(listed.id, personalSpaceId, { withGrades });
  if (!full?.rankEntity) {
    // Listed but the full read returns nothing (it can fail to decode where the
    // listing doesn't). The listing's own votes are whole as long as its
    // relations stopped short of the cap; past it, they may be truncated.
    if ((listed.relations?.length ?? 0) < LISTING_RELATIONS_LIMIT) {
      const orderedEntityIds = getMyRankingOrderedEntityIds(listed, personalSpaceId);
      // The listing carries no grades: on Best debates they are read for it the same way, so a
      // publish built on this read never takes them for "ungraded".
      const grades = withGrades ? await readGrades(listed, personalSpaceId, orderedEntityIds) : NO_GRADES;
      return { rankEntity: listed, orderedEntityIds, grades };
    }
    console.error('[fetchMyRankingBallot] Ranking is listed but its full read fails:', listed.id);
    throw new RankingBallotUnreadableError(listed.id, listed.createdAt);
  }
  // `createdAt` (the rolling clock) only comes with the listing.
  return {
    rankEntity: { ...full.rankEntity, createdAt: listed.createdAt ?? full.rankEntity.createdAt },
    orderedEntityIds: full.orderedEntityIds,
    grades: full.grades,
  };
}
