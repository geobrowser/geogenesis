import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';
import { fetchProposals } from '~/core/io/subgraph/fetch-proposals';

import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  entityDiffToRankingEntry,
  pendingEntityMatchesRanking,
  type RankingPendingProposalData,
  type RankingRelationConstraint,
} from './ranking-pending-proposal-entries';

const MAX_PROPOSALS = 100;

export async function fetchRankingPendingProposalData(
  spaceId: string,
  proposedBy: string,
  relationConstraints: RankingRelationConstraint[],
  signal?: AbortController['signal']
): Promise<RankingPendingProposalData> {
  if (!spaceId || !proposedBy) return EMPTY_RANKING_PENDING_PROPOSAL_DATA;

  const proposals = await fetchProposals({
    spaceId,
    signal,
    first: MAX_PROPOSALS,
    proposedBy,
    actionTypes: ['Publish'],
  });

  const openProposals = proposals.filter(proposal => proposal.status === 'PROPOSED');

  const pendingEntityIds = new Set<string>();
  const entriesByEntityId = new Map<string, ReturnType<typeof entityDiffToRankingEntry>>();

  await Promise.all(
    openProposals.map(async proposal => {
      const diff = await fetchProposalDiffs(proposal.id, spaceId);
      if (diff.status !== 'success') return;

      for (const entity of diff.entities) {
        if (!pendingEntityMatchesRanking(entity, relationConstraints)) continue;
        pendingEntityIds.add(entity.entityId);
        entriesByEntityId.set(entity.entityId, entityDiffToRankingEntry(entity));
      }
    })
  );

  return { pendingEntityIds, entriesByEntityId };
}
