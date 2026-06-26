import { ID } from '~/core/id';
import { fetchProposalsByUser } from '~/core/io/fetch-proposals-by-user';
import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';

import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  type RankingPendingProposalData,
  entityDiffToRankingEntry,
} from './ranking-pending-proposal-entries';

const MAX_PAGES_PER_PROPOSER = 3;

export type FetchRankingPendingEntitiesOptions = {
  spaceId: string;
  unresolvedEntityIds: string[];
  proposerSpaceIds: string[];
  signal?: AbortController['signal'];
};

export async function fetchRankingPendingEntities({
  spaceId,
  unresolvedEntityIds,
  proposerSpaceIds,
  signal,
}: FetchRankingPendingEntitiesOptions): Promise<RankingPendingProposalData> {
  if (!spaceId || unresolvedEntityIds.length === 0 || proposerSpaceIds.length === 0) {
    return EMPTY_RANKING_PENDING_PROPOSAL_DATA;
  }

  const wantedByHex = new Map<string, string>();
  for (const id of unresolvedEntityIds) {
    if (id) wantedByHex.set(ID.uuidToHex(id), id);
  }
  if (wantedByHex.size === 0) return EMPTY_RANKING_PENDING_PROPOSAL_DATA;

  const pendingEntityIds = new Set<string>();
  const entriesByEntityId = new Map<string, ReturnType<typeof entityDiffToRankingEntry>>();

  await Promise.all(
    [...new Set(proposerSpaceIds.filter(Boolean))].map(async proposerSpaceId => {
      for (let page = 0; page < MAX_PAGES_PER_PROPOSER; page++) {
        if (pendingEntityIds.size === wantedByHex.size) return;

        const proposals = await fetchProposalsByUser({ proposerSpaceId, spaceId, page, signal });
        if (proposals.length === 0) return;

        const openPublishProposals = proposals.filter(
          proposal => proposal.status === 'PROPOSED' && proposal.type === 'ADD_EDIT'
        );

        await Promise.all(
          openPublishProposals.map(async proposal => {
            const diff = await fetchProposalDiffs(ID.uuidToHex(proposal.id), ID.uuidToHex(proposal.space.id));
            if (diff.status !== 'success') return;

            for (const entity of diff.entities) {
              const wantedId = wantedByHex.get(ID.uuidToHex(entity.entityId));
              if (!wantedId || entriesByEntityId.has(wantedId)) continue;
              pendingEntityIds.add(wantedId);
              entriesByEntityId.set(wantedId, { ...entityDiffToRankingEntry(entity), entityId: wantedId });
            }
          })
        );

        if (proposals.length < 5) return;
      }
    })
  );

  return { pendingEntityIds, entriesByEntityId };
}
