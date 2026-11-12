import { normId } from '~/core/utils/norm-id';
import { validateSpaceId } from '~/core/utils/utils';

import { BEST_DEBATES_BLOCK_ID } from './best-debates';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';

/**
 * Whether `blockId` is the Best debates ranking block (GEO-3591). Everything Best-debates-only on
 * the ranking screen (GEO-3678) hangs off this, so every other ranking block behaves as before.
 *
 * `bestDebatesBlockId` defaults to the shared constant, which stays null until GEO-3685 creates the
 * block; tests pass their own.
 */
export function isBestDebatesBlock(
  blockId: string | null | undefined,
  bestDebatesBlockId: string | null = BEST_DEBATES_BLOCK_ID
): boolean {
  if (!blockId || !bestDebatesBlockId) return false;
  return normId(blockId) === normId(bestDebatesBlockId);
}

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

export function rankingBallotRules(
  blockId: string,
  bestDebatesBlockId: string | null = BEST_DEBATES_BLOCK_ID
): RankingBallotRules {
  return isBestDebatesBlock(blockId, bestDebatesBlockId) ? BEST_DEBATES_RULES : DEFAULT_RULES;
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
