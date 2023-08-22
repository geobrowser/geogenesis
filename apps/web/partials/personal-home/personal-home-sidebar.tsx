// stubbing this out for now to get a feel for the io
import { PersonalHomeSidebarCard } from './personal-home-sidebar-card';
import { PersonalHomeRequest, VoteProposal } from './types';

interface Props {
  voteProposals: VoteProposal[];
  requests: PersonalHomeRequest[];
}

// @TODO: need to rework the mock data to match the updated design

export function PersonalHomeSidebar({ voteProposals, requests }: Props) {
  const activeProposalsAmount = voteProposals.filter(proposal => proposal.status === 'pending').length;
  const completedProposalsAmount = voteProposals.filter(
    proposal => proposal.status === 'approved' || proposal.status === 'rejected'
  ).length;
  const memberRequestsAmount = requests.filter(request => request.requestType === 'member').length;
  const editRequestsAmount = requests.filter(request => request.requestType === 'editor').length;

  return (
    <div className="flex flex-col gap-3 max-w-[300px]">
      <PersonalHomeSidebarCard title="My Proposals" amount={activeProposalsAmount} proposalStatus="In Progress" />
      <PersonalHomeSidebarCard
        title="Proposals I've voted on"
        amount={completedProposalsAmount}
        proposalStatus="In Progress"
      />
      <PersonalHomeSidebarCard title="I have accepted" amount={memberRequestsAmount} proposalStatus="In Progress" />
    </div>
  );
}
