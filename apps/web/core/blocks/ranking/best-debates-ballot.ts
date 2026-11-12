import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

import { BEST_DEBATES_BLOCK_ID } from './best-debates';
import { isBestDebatesBlock } from './best-debates-views';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';

export type RankingBallotRules = {
  /**
   * ORDINAL on Best debates: the indexer's average mode scores those by position (#1 = 1.0, last =
   * 0.5). It min-max scales WEIGHTED ballots instead, which put the middle of a 300-debate list at
   * about 0.51 rather than 0.75.
   */
  rankType: 'ORDINAL' | 'WEIGHTED';
  /**
   * Every item must carry its own valid space. `ranking_scores` is keyed by (block, entity, space),
   * so a debate filed under the block's space as well as its own would split into two half-strength
   * rows. An item without a valid space is left out of the ballot rather than given the block's.
   */
  requireItemSpace: boolean;
};

const DEFAULT_RULES: RankingBallotRules = { rankType: 'WEIGHTED', requireItemSpace: false };
const BEST_DEBATES_RULES: RankingBallotRules = { rankType: 'ORDINAL', requireItemSpace: true };

/**
 * The rules for a ballot on `blockId`, which lives in `blockSpaceId`. Best debates is the Debates
 * space's block only (`isBestDebatesBlock`, shared with GEO-3677); every other block keeps the
 * defaults. `bestDebatesBlockId` is injectable for tests.
 */
export function rankingBallotRules(
  blockId: string,
  blockSpaceId: string,
  bestDebatesBlockId: string | null = BEST_DEBATES_BLOCK_ID
): RankingBallotRules {
  return isBestDebatesBlock(blockId, blockSpaceId, bestDebatesBlockId) ? BEST_DEBATES_RULES : DEFAULT_RULES;
}

const rankTypePropertyKey = normId(SystemIds.RANK_TYPE_PROPERTY);

/** The Rank entity's `Rank type` text, or null when it isn't known (e.g. a just-published pin). */
export function rankTypeOf(rankEntity: { values?: Entity['values'] } | null | undefined): string | null {
  const value = rankEntity?.values?.find(v => normId(v.property.id) === rankTypePropertyKey && !v.isDeleted);
  return value?.value?.trim() || null;
}

/**
 * Whether a ballot on this block must go out as a fresh Rank rather than an update of the ranker's
 * existing one: Best debates, and the existing Rank is known to be something other than ORDINAL.
 *
 * gaia's ranking indexer reads a Rank's type once, when the Rank is created, and never from a later
 * edit. ORDINAL votes on a Rank it holds as WEIGHTED carry no weight and drop out of `sum` scoring,
 * and relabelling the entity wouldn't reach the indexer. A fresh ORDINAL Rank is detected with its
 * type, and the latest-ballot rule (`ranking-ballot-recency.ts`, by creation time) makes it the one
 * that counts. An unknown type (e.g. the synthetic entity of a just-published pin) keeps the update,
 * so a ballot never mints a new Rank on every publish.
 */
export function mustMintFreshRank(
  rankEntity: { values?: Entity['values'] } | null | undefined,
  rules: RankingBallotRules
): boolean {
  if (!rankEntity || rules.rankType !== 'ORDINAL') return false;
  const type = rankTypeOf(rankEntity);
  return type != null && type !== rules.rankType;
}

export type RankingBallotVote =
  { entityId: string; spaceId: string; value: number } | { entityId: string; spaceId: string; value?: undefined };

/**
 * The votes a ballot publishes, in order. Under the default rules this is exactly what
 * `saveMySubmission` always sent: a weight per position, and the block's space for an item whose own
 * space is missing or invalid. Under Best debates rules items keep only their own space, an item
 * without one is dropped, and ORDINAL votes carry no weight.
 */
export function buildRankingVotes(
  slots: RankingSubmissionSlot[],
  rules: RankingBallotRules,
  blockSpaceId: string
): RankingBallotVote[] {
  if (!rules.requireItemSpace) {
    return slots.map((slot, index) => ({
      entityId: slot.id,
      spaceId: slot.spaceId && validateSpaceId(slot.spaceId) ? slot.spaceId : blockSpaceId,
      value: rankingVoteWeightFromIndex(index),
    }));
  }

  const votes: RankingBallotVote[] = [];
  for (const slot of slots) {
    if (!slot.spaceId || !validateSpaceId(slot.spaceId)) continue;
    votes.push(
      rules.rankType === 'ORDINAL'
        ? { entityId: slot.id, spaceId: slot.spaceId }
        : { entityId: slot.id, spaceId: slot.spaceId, value: rankingVoteWeightFromIndex(votes.length) }
    );
  }
  return votes;
}
