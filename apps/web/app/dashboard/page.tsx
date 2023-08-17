import { PersonalHomeRequest, VoteProposal } from '~/partials/personal-home/types';

import { Component } from './component';

/* considerations & notes:
data:
  - fetch data (per tab) in page.tsx -> pass to component.tsx -> pass to each partial component as needed
  - mocked the data for now and will update when the backend is in place -- appropximated the data flow/props
  - need to move the user profile data (address -> name/avatarUrl) to the server to remove load time
    - will need to do this for all data being fetched since the data will be scoped to the connected user
routes:
  - currently the route is /dashboard while scaffolding
    - originally had it as /dashboard/[userAddress] but thinking we'd use that for public profiles
*/

const mockVoteProposals: VoteProposal[] = [
  {
    name: 'Deleted entities over multiple pages',
    status: 'pending',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
    spaceName: 'Philosophy',
    votes: [{ value: 'yes' }, { value: 'no' }, { value: 'yes' }, { value: 'no' }, { value: 'yes' }],
  },
  {
    name: 'Updated the description of the space',
    status: 'approved',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
    spaceName: 'Philosophy',
    votes: [{ value: 'yes' }, { value: 'no' }, { value: 'yes' }, { value: 'no' }, { value: 'yes' }],
  },
  {
    name: 'Changed the space name',
    status: 'rejected',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
    spaceName: 'Philosophy',
    votes: [{ value: 'no' }, { value: 'no' }, { value: 'yes' }, { value: 'no' }, { value: 'yes' }],
  },
];

const mockJoinRequests: PersonalHomeRequest[] = [
  {
    requestType: 'member',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Philosophy Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Jonathan Prozzi',
    spaceName: 'Personal development Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
  {
    requestType: 'member',
    requesterName: 'Dade Murphy',
    spaceName: 'Hackers Test Space',
    spaceId: '0xB4B3d95e9c82cb26A5bd4BC73ffBa46F1e979f16',
  },
  {
    requestType: 'editor',
    requesterName: 'Zero Cool',
    spaceName: 'Hackers Test Space',
    spaceId: '0x4Ade9E4dB33D275A588d31641C735f25cFD52891',
  },
];

export default function PersonalHomePage() {
  return <Component requests={mockJoinRequests} voteProposals={mockVoteProposals} />;
}
