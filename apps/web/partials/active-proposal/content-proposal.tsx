import * as React from 'react';

import { Proposal } from '~/core/io/dto/proposals';
import { Change } from '~/core/utils/change';
import { getIsProposalEnded } from '~/core/utils/utils';

import { ChangedEntity } from '../diff/changed-entity';

export async function ContentProposal({ proposal, spaceId }: { proposal: Proposal; spaceId: string }) {
  // Depending on whether the proposal is active or ended we need to compare against
  // either the live versions of entities in the proposal or against the state of
  // entities in the proposal as they existed at the time the proposal ended.
  const changes = getIsProposalEnded(proposal.status, proposal.endTime)
    ? await Change.fromEndedProposal(proposal, spaceId)
    : await Change.fromActiveProposal(proposal, spaceId);

  return (
    <div className="flex flex-col gap-16 divide-y divide-divider">
      {changes.map(change => {
        return <ChangedEntity key={change.id} change={change} />;
      })}
    </div>
  );
}
