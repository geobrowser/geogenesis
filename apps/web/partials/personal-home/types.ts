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

// will remove the Omits once backend is in and can see what overlap there is
export type VoteProposal = Omit<
  Proposal,
  'id' | 'description' | 'createdAt' | 'createdBy' | 'createdAtBlock' | 'proposedVersions'
> & {
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  createdBy: string; // this'll use the createdBy (Person) but simplifying for mocking
  votes: Vote[]; // this'll be subject to the API but will likely be an object
  time: string; // unsure how we'll want to represent the time remaining
};

// likely will want time to be distance to the end date of the voting period
