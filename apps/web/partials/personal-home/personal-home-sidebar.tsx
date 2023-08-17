// stubbing this out for now to get a feel for the io
import { PersonalHomeSidebarCard } from './personal-home-sidebar-card';
import { PersonalHomeRequest, VoteProposal } from './types';

interface Props {
  voteProposals: VoteProposal[];
  requests: PersonalHomeRequest[];
}

export function PersonalHomeSidebar({ voteProposals, requests }: Props) {
  console.log('vote proposals', voteProposals);

  const activeProposalsAmount = voteProposals.filter(proposal => proposal.status === 'pending').length;
  const completedProposalsAmount = voteProposals.filter(
    proposal => proposal.status === 'approved' || proposal.status === 'rejected'
  ).length;
  const memberRequestsAmount = requests.filter(request => request.requestType === 'member').length;
  const editRequestsAmount = requests.filter(request => request.requestType === 'editor').length;

  return (
    <div className="flex flex-col gap-3 max-w-[300px]">
      <PersonalHomeSidebarCard title="Active proposals" amount={activeProposalsAmount} />
      <PersonalHomeSidebarCard title="Completed proposals" amount={completedProposalsAmount} />
      <PersonalHomeSidebarCard title="Member requests" amount={memberRequestsAmount} />
      <PersonalHomeSidebarCard title="Editor requests" amount={editRequestsAmount} />
    </div>
  );
}
