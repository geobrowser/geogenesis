import { cookies } from 'next/headers';

import * as React from 'react';

import { Cookie } from '~/core/cookie';
import { options } from '~/core/environment/environment';
import { Subgraph } from '~/core/io';

import { getEditorsForSpace } from '../space-page/get-editors-for-space';
import { GovernanceProposalCard } from './governance-proposal-card';
import { GovernanceProposalProvider, GovernanceViewProposal } from './governance-view-proposal';
import { GovernanceViewProposalContent } from './governance-view-proposal-content';

interface Props {
  spaceId: string;
}

export async function GovernanceProposalsList({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  const [proposals, editorsForSpace] = await Promise.all([
    // TODO: Get env from cookie
    Subgraph.fetchProposals({ spaceId, first: 5, endpoint: options.production.subgraph }),
    getEditorsForSpace(spaceId, connectedAddress),
  ]);

  return (
    <div className="flex flex-col gap-3">
      {proposals.map(p => (
        <GovernanceProposalProvider key={p.id}>
          <GovernanceProposalCard proposal={p} isEditor={editorsForSpace.isEditor} />
          <GovernanceViewProposal
            proposalContent={
              <React.Suspense>
                {/* @ts-expect-error async JSX function */}
                <GovernanceViewProposalContent proposalId={p.id} spaceId={spaceId} />
              </React.Suspense>
            }
          />
        </GovernanceProposalProvider>
      ))}
    </div>
  );
}
