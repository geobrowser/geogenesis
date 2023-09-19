'use client';

import pluralize from 'pluralize';

import { Proposal } from '~/core/types';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';

import { Avatar } from '~/design-system/avatar';

import { GovernanceProposalVoteState } from './governance-proposal-vote-state';
import { GovernanceStatusChip } from './governance-status-chip';
import { useGovernanceProposal } from './governance-view-proposal';

interface Props {
  isEditor: boolean;
  proposal: Proposal;
}

export function GovernanceProposalCard({ isEditor, proposal }: Props) {
  const { setIsOpen } = useGovernanceProposal();

  const changeCount = Action.getChangeCount(
    proposal.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
  );

  return (
    <div
      onClick={() => setIsOpen(true)}
      key={proposal.id}
      className="w-full rounded border border-grey-02 p-4 shadow-button"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-smallTitle">{proposal.name}</h3>
          <div className="flex items-center gap-5 text-breadcrumb text-grey-04">
            <div className="flex items-center gap-1.5">
              <div className="relative h-3 w-3 overflow-hidden rounded-full">
                <Avatar avatarUrl={proposal.createdBy.avatarUrl} value={proposal.createdBy.id} />
              </div>
              <p>{proposal.createdBy.name ?? proposal.createdBy.id}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <p>
                {changeCount} {pluralize('edit', changeCount)}
              </p>
              <p>·</p>
              <p>
                {proposal.proposedVersions.length} {pluralize('entity', proposal.proposedVersions.length)}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <GovernanceStatusChip date={proposal.createdAt} status="ACCEPTED" />

          <GovernanceProposalVoteState isEditor={isEditor} />
        </div>
      </div>
    </div>
  );
}
