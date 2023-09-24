import { SYSTEM_IDS } from '@geogenesis/ids';
import pluralize from 'pluralize';

import { options } from '~/core/environment/environment';
import { Subgraph } from '~/core/io';
import { Action as IAction } from '~/core/types';
import { Action } from '~/core/utils/action';
import { Change } from '~/core/utils/change';
import { ProposalChangeset } from '~/core/utils/change/change';

import { Avatar } from '~/design-system/avatar';

import { ChangedEntity } from '../history/changed-entity';
import { EntityId } from '../history/types';
import { GovernanceViewProposalContentHeader } from './governance-view-proposal-content-header';

interface Props {
  spaceId: string;
  proposalId: string;
}

export async function GovernanceViewProposalContent({ proposalId, spaceId }: Props) {
  // @TODO: get env from cookie
  const [space, proposal] = await Promise.all([
    Subgraph.fetchSpace({ id: spaceId, endpoint: options.production.subgraph }),
    Subgraph.fetchProposal({ id: proposalId, endpoint: options.production.subgraph }),
  ]);

  if (!proposal || !space) {
    return <p>Proposal does not exist</p>;
  }

  const previousProposal = await Subgraph.fetchProposal({
    id: '',
    blockStart: Number(proposal.createdAtBlock) - 1,
    endpoint: options.production.subgraph,
  });

  const changeset = await Change.fromProposal(proposalId, previousProposal?.id ?? '', Subgraph, options.production);

  const changeCount = Action.getChangeCount(
    proposal.proposedVersions.reduce<IAction[]>((acc, version) => acc.concat(version.actions), [])
  );

  return (
    <div className="flex min-h-full flex-col gap-2">
      <GovernanceViewProposalContentHeader
        spaceName={space.attributes[SYSTEM_IDS.NAME] ?? null}
        spaceImage={space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null}
      />
      <div className="space-y-4 bg-white px-20 py-5">
        <h1 className="text-mediumTitle">{proposal.name}</h1>
        <div className="space-x-3">
          <div className="flex items-center gap-1.5 text-metadataMedium text-grey-04">
            <p>
              {changeCount} {pluralize('edit', changeCount)}
            </p>
            <span>·</span>
            <p>
              {proposal.proposedVersions.length} {pluralize('entity', proposal.proposedVersions.length)}
            </p>
            <span>·</span>
            <div className="relative h-3 w-3 overflow-hidden rounded-full">
              <Avatar avatarUrl={proposal.createdBy.avatarUrl ?? ''} value={proposal.createdBy.id} />
            </div>
            <p>{proposal.createdBy.name ?? proposal.createdBy.id}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 rounded-t-xl bg-white px-20 py-10">
        <ProposalDiff proposalChangeset={changeset} />
      </div>
    </div>
  );
}

interface ProposalDiffProps {
  proposalChangeset: ProposalChangeset;
}

export function ProposalDiff({ proposalChangeset }: ProposalDiffProps) {
  const { changes, proposals } = proposalChangeset;

  if (!proposals.selected) {
    return <div className="text-metadataMedium">No proposals found.</div>;
  }

  const changedEntityIds = Object.keys(changes);

  return (
    <div className="relative flex flex-col gap-16">
      <div>
        <div className="flex gap-8">
          <div className="flex-1">
            <h3 className="text-body">Current version</h3>
          </div>
          <div className="flex-1">
            <h3 className="text-body">Proposed version</h3>
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
