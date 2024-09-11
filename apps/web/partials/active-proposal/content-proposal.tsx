import * as React from 'react';

import { Proposal } from '~/core/io/dto/proposals';

export async function ContentProposal({ proposal }: { proposal: Proposal }) {
  // const previousProposalId = await fetchPreviousProposalId({
  //   spaceId: proposal.space.id,
  //   createdAt: proposal.createdAt,
  // });

  // Depending on whether the proposal is active or ended we need to compare against
  // either the live versions of entities in the proposal or against the state of
  // entities in the proposal as they existed at the time the proposal ended.
  // const { changes, proposals } = getIsProposalEnded(proposal.status, proposal.endTime)
  //   ? await getEndedProposalDiff(proposal, previousProposalId, Subgraph)
  //   : await getActiveProposalDiff(proposal, previousProposalId, Subgraph);

  // if (!proposals.selected) {
  //   return <div className="text-metadataMedium">Selected proposal not found.</div>;
  // }

  // const changedEntityIds = Object.keys(changes);

  return (
    <div className="flex flex-col gap-16 divide-y divide-grey-02">
      {/* {changedEntityIds.map((entityId: EntityId) => (
        <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
      ))} */}
      Diffs are temporarily disabled
    </div>
  );
}
