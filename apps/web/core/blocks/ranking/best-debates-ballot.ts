import { Graph, SystemIds } from '@geoprotocol/geo-sdk/lite';

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
 * Ops that set an existing Rank entity's `Rank type` to the rules' type, when it doesn't already
 * say so. geo-sdk's `ranks.update` re-sends the votes but never rewrites the type (only
 * `ranks.create` writes it), so a ballot first published WEIGHTED on Best debates would otherwise
 * carry ORDINAL votes under a WEIGHTED label. Nothing for the default rules.
 */
export function rankTypeRewriteOps(
  rankEntity: { id: string; values?: Entity['values'] } | null | undefined,
  rules: RankingBallotRules
) {
  if (!rankEntity || rules.rankType !== 'ORDINAL') return [];
  if (rankTypeOf(rankEntity) === rules.rankType) return [];
  return Graph.updateEntity({
    id: rankEntity.id,
    values: [
      // No language: the SDK writes English, as `ranks.create` does, so this replaces that value.
      { property: SystemIds.RANK_TYPE_PROPERTY, type: 'text', value: rules.rankType },
    ],
  }).ops;
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
