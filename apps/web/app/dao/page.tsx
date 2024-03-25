import { VoteOption } from '@geogenesis/sdk';

import { fetchProposals } from '~/core/io/subgraph';
import { toTitleCase } from '~/core/utils/utils';

import { ClientOnly } from '~/design-system/client-only';

import { TEST_DAO_ADDRESS } from './constants';
import { CreateDao } from './create-dao';
import { CreateProposal } from './create-proposal';
import { Execute } from './execute';
import { Refetch } from './refetch';
import { Vote } from './vote';

export const revalidate = 0;

export default async function Page() {
  const proposals = await fetchProposals({ spaceId: TEST_DAO_ADDRESS });

  return (
    <div className="space-y-4">
      <Refetch />

      <div className="space-y-8">
        <div className="divide-y-2 divide-divider">
          {proposals.map(p => {
            const secondsRemaining = Math.floor(p.endTime - Date.now() / 1000);
            const isAwaitingExecution = secondsRemaining <= 0;

            return (
              <div key={p.id} className="py-4">
                <p className="text-button">{p.name}</p>
                <p>{isAwaitingExecution && p.status !== 'ACCEPTED' ? 'Pending execution' : toTitleCase(p.status)}</p>
                <p>
                  {isAwaitingExecution || p.status === 'ACCEPTED'
                    ? 'Voting concluded'
                    : `${secondsRemaining} seconds remaining`}{' '}
                </p>
                <div className="flex items-center gap-2">
                  <p>Total votes: {p.proposalVotes.totalCount}</p>
                  <p>Yes: {p.proposalVotes.nodes.filter(p => p.vote === 'ACCEPT').length}</p>
                  <p>No: {p.proposalVotes.nodes.filter(p => p.vote === 'REJECT').length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Vote onchainProposalId={p.onchainProposalId} type={VoteOption.Yes}>
                    Yes
                  </Vote>
                  <Vote onchainProposalId={p.onchainProposalId} type={VoteOption.No}>
                    No
                  </Vote>
                  <Execute onchainProposalId={p.onchainProposalId}>Execute</Execute>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-row gap-4">
        <ClientOnly>
          <CreateDao />
        </ClientOnly>
        <ClientOnly>
          <CreateProposal type="content" />
        </ClientOnly>
      </div>
    </div>
  );
}
