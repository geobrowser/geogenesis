import { SYSTEM_IDS } from '@geogenesis/ids';

import { options } from '~/core/environment/environment';
import { Subgraph } from '~/core/io';
import { Change } from '~/core/utils/change';

import { ProposalDiff } from '../history/proposal-diff';
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

  return (
    <div className="flex min-h-full flex-col gap-2">
      <GovernanceViewProposalContentHeader
        spaceName={space.attributes[SYSTEM_IDS.NAME] ?? null}
        spaceImage={space.attributes[SYSTEM_IDS.IMAGE_ATTRIBUTE] ?? null}
      />
      <div className="bg-white px-20 py-5">
        <h1 className="text-mediumTitle">{proposal.name}</h1>
      </div>
      <div className="flex-1 rounded-t-xl bg-white px-20 py-10">
        <ProposalDiff proposalChangeset={changeset} />
      </div>
    </div>
  );
}
