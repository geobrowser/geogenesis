import { PersonalHomeProposalCard } from './personal-home-proposal-card';
import { VoteProposal } from './types';

interface Props {
  voteProposals: VoteProposal[];
}

export function PersonalHomeProposalsFeed({ voteProposals }: Props) {
  return (
    <div className="flex flex-col my-4 gap-3">
      {voteProposals?.map((voteProposal, idx) => (
        <PersonalHomeProposalCard
          key={idx}
          name={voteProposal.name}
          description={voteProposal.description}
          createdBy={voteProposal.createdBy}
          status={voteProposal.status}
          time={voteProposal.time}
          votes={voteProposal.votes}
        />
      ))}
    </div>
  );
}
