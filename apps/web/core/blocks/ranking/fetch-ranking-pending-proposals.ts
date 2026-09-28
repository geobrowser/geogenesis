import { ID } from '~/core/id';
import { fetchProposalsByUser } from '~/core/io/fetch-proposals-by-user';
import { fetchProposalDiffs } from '~/core/io/subgraph/fetch-proposal-diffs';

import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  type RankingPendingProposalData,
  entityDiffToRankingEntry,
} from './ranking-pending-proposal-entries';

const MAX_PAGES_PER_PROPOSER = 3;
// Bounds diff requests per call; each proposer's proposals arrive newest first.
const MAX_DIFFS = 10;

// Matches the proposal name set by the ranking compose "Create new" flow.
const CREATE_NEW_PROPOSAL_MARKER = ' - Create new - ';

function isCreateNewProposal(proposal: { status: string; type: string; name: string | null }): boolean {
  return (
    proposal.status === 'PROPOSED' &&
    proposal.type === 'ADD_EDIT' &&
    Boolean(proposal.name?.includes(CREATE_NEW_PROPOSAL_MARKER))
  );
}

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
  let diffBudget = MAX_DIFFS;

  await Promise.all(
    [...new Set(proposerSpaceIds.filter(Boolean))].map(async proposerSpaceId => {
      for (let page = 0; page < MAX_PAGES_PER_PROPOSER; page++) {
        if (pendingEntityIds.size === wantedByHex.size || diffBudget <= 0) return;

        const proposals = await fetchProposalsByUser({
          proposerSpaceId,
          spaceId,
          page,
          signal,
          includeProfiles: false,
        });
        if (proposals.length === 0) return;

        const createNewProposals = proposals.filter(isCreateNewProposal).slice(0, Math.max(0, diffBudget));
        diffBudget -= createNewProposals.length;

        await Promise.all(
          createNewProposals.map(async proposal => {
            // Only entity ids and NAME/DESCRIPTION values are read, so skip post-processing.
            const diff = await fetchProposalDiffs(ID.uuidToHex(proposal.id), ID.uuidToHex(proposal.space.id), {
              postProcess: false,
              signal,
            });
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
