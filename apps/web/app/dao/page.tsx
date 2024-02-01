import { VoteOption } from '@geogenesis/sdk';

import { fetchProposals } from '~/core/io/subgraph';

import { ClientOnly } from '~/design-system/client-only';

import CreateDao from './create-dao';
import { CreateProposal } from './create-proposal';
import { Vote } from './vote';

export default async function Page() {
  const proposals = await fetchProposals({ spaceId: '0x9b843a69F456f9422eCfB7247d1344Eb14C40A93' });

  return (
    <div className="space-y-4">
      <div className="flex flex-row gap-4">
        <ClientOnly>
          <CreateDao />
        </ClientOnly>
        <ClientOnly>
          <CreateProposal type="content" />
        </ClientOnly>
      </div>

      <div className="space-y-8">
        <div className="divide-y-2 divide-divider">
          {proposals.map(p => {
            // convert current time to seconds (instead of milliseconds) and divide the difference
            // between now and end time by seconds in an hour to get the hours remaining
            const hoursRemaining = Math.floor((p.endTime - Date.now() / 1000) / 3600);
            const minutesRemaining = Math.floor((p.endTime - Date.now() / 1000) / 60 / 24);

            return (
              <div key={p.id} className="py-4">
                <p>{p.name}</p>
                <p>{p.status}</p>
                <p>
                  {hoursRemaining} hours and {minutesRemaining} minutes remaining
                </p>
                <div className="flex items-center gap-2">
                  <p>Total votes: {p.proposalVotes.totalCount}</p>
                  <p>Yes: {p.proposalVotes.nodes.filter(p => p.vote === 'YES').length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Vote onchainProposalId={p.onchainProposalId} type={VoteOption.Yes}>
                    Yes
                  </Vote>
                  <Vote onchainProposalId={p.onchainProposalId} type={VoteOption.No}>
                    No
                  </Vote>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
