import { PersonalHomeProposalCard } from './personal-home-proposal-card';
import { VoteProposal } from './types';

interface Props {
  voteProposals: VoteProposal[];
}

export function PersonalHomeProposalsFeed({ voteProposals }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {voteProposals?.map((voteProposal, idx) => (
        <PersonalHomeProposalCard
          key={idx}
          name={voteProposal.name}
          createdBy={voteProposal.createdBy}
          status={voteProposal.status}
          votes={voteProposal.votes}
          space={voteProposal.space}
          endDate={voteProposal.endDate}
        />
      ))}
    </div>
  );
}
