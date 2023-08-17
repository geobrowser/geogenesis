import { PersonalHomeRequest, VoteProposal } from '~/partials/personal-home/types';

import { Component } from './component';

// currently the route is /dashboard while scaffolding
// originally had it as /dashboard/[userAddress] but thinking we'd use that for public profiles

const mockVoteProposals: VoteProposal[] = [
  {
    name: 'Deleted entities over multiple pages',
    status: 'pending',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
    votes: [{ value: 'yes' }, { value: 'no' }, { value: 'yes' }, { value: 'no' }, { value: 'yes' }],
  },
  {
    name: 'Deleted entities over multiple pages',
    status: 'approved',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
    votes: [{ value: 'yes' }, { value: 'no' }, { value: 'yes' }, { value: 'no' }, { value: 'yes' }],
  },
  {
    name: 'Deleted entities over multiple pages',
    status: 'rejected',
    createdBy: 'Jonathan Prozzi',
    time: '24:00:00',
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
