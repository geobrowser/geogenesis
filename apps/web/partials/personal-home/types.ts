import { Proposal } from '~/core/types';

export type PersonalHomeRequest = {
  requestType: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  spaceName?: string;
  spaceId?: string;
};

type Vote = {
  value: 'yes' | 'no';
};
export type VoteProposal = Omit<Proposal, 'id' | 'createdAt' | 'createdAtBlock' | 'proposedVersions'> & {
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  votes: Vote[]; // this'll be subject to the API but will likely be an object
  time: string; // unsure how we'll want to represent the time remaining
};
