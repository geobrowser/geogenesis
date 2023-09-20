import { useQuery } from '@tanstack/react-query';
import pluralize from 'pluralize';

import { Services } from '~/core/services';
import { Action as ActionType, Proposal as ProposalType } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Change } from '~/core/utils/change';
import { ProposalChangeset } from '~/core/utils/change/change';
import { formatShortAddress } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';

import { ChangedEntity } from './changed-entity';
import { EntityId } from './types';

export const useChangesFromProposals = (selectedProposal: string, previousProposal: string) => {
  const { subgraph, config } = Services.useServices();
  const { data, isLoading } = useQuery({
    queryKey: [`${selectedProposal}-changes-from-${previousProposal}`],
    queryFn: async () => Change.fromProposal(selectedProposal, previousProposal, subgraph, config),
  });

  return [data, isLoading] as const;
};

interface ProposalDiffProps {
  proposalChangeset: ProposalChangeset;
}

export function ProposalDiff({ proposalChangeset }: ProposalDiffProps) {
  const { changes, proposals } = proposalChangeset;

  if (!proposals.selected) {
    return <div className="text-metadataMedium">No proposals found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  const proposal: ProposalType = proposals.selected;

  const selectedVersionChangeCount = Action.getChangeCount(
    proposal.proposedVersions.reduce<ActionType[]>((acc, version) => acc.concat(version.actions), [])
  );

  const selectedVersionFormattedLastEditedDate = new Date(proposals.selected.createdAt * 1000).toLocaleDateString(
    undefined,
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  );

  const selectedVersionLastEditedTime = new Date(selectedVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  let previousVersionChangeCount;
  let previousVersionFormattedLastEditedDate;
  let previousVersionLastEditedTime;

  if (proposals.previous) {
    const proposal: ProposalType = proposals.previous;

    previousVersionChangeCount = Action.getChangeCount(
      proposal.proposedVersions.reduce<ActionType[]>((acc, version) => acc.concat(version.actions), [])
    );

    previousVersionFormattedLastEditedDate = new Date(proposal.createdAt * 1000).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    previousVersionLastEditedTime = new Date(previousVersionFormattedLastEditedDate).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return (
    <div className="relative flex flex-col gap-16">
      <div>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="text-body">Previous proposal</div>
            {proposals.previous && (
              <>
                <div className="text-mediumTitle">{proposals.previous.name}</div>
                <div className="mt-1 flex items-center gap-4">
                  <div className="inline-flex items-center gap-1">
                    <div className="relative h-3 w-3 overflow-hidden rounded-full">
                      <Avatar
                        alt={`Avatar for ${proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}`}
                        avatarUrl={proposals.previous.createdBy.avatarUrl}
                        value={proposals.previous.createdBy.name ?? proposals.previous.createdBy.id}
                      />
                    </div>
                    <p className="text-smallButton">
                      {proposals.previous.createdBy.name ?? formatShortAddress(proposals.previous.createdBy.id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-smallButton">
                      {previousVersionChangeCount} {pluralize('edit', previousVersionChangeCount)} ·{' '}
                      {previousVersionFormattedLastEditedDate} · {previousVersionLastEditedTime}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex-1">
            <div className="text-body">Selected proposal</div>
            <div className="text-mediumTitle">{proposals.selected.name}</div>
            <div className="mt-1 flex items-center gap-4">
              <div className="inline-flex items-center gap-1">
                <div className="relative h-3 w-3 overflow-hidden rounded-full">
                  <Avatar
                    alt={`Avatar for ${proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}`}
                    avatarUrl={proposals.selected.createdBy.avatarUrl}
                    value={proposals.selected.createdBy.name ?? proposals.selected.createdBy.id}
                  />
                </div>
                <p className="text-smallButton">
                  {proposals.selected.createdBy.name ?? formatShortAddress(proposals.selected.createdBy.id)}
                </p>
              </div>
              <div>
                <p className="text-smallButton">
                  {selectedVersionChangeCount} {pluralize('edit', selectedVersionChangeCount)} ·{' '}
                  {selectedVersionFormattedLastEditedDate} · {selectedVersionLastEditedTime}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-16 divide-y divide-grey-02">
        {changedEntityIds.map((entityId: EntityId) => (
          <ChangedEntity key={entityId} change={changes[entityId]} entityId={entityId} />
        ))}
      </div>
    </div>
  );
}
