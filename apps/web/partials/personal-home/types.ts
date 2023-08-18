import { DateValue, OmitStrict, Proposal } from '~/core/types';

export type PersonalHomeRequest = {
  requestType: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  spaceName?: string;
  spaceId?: string;
};

export type Vote = {
  value: 'yes' | 'no';
};

// will remove the Omits once backend is in and can see what overlap there is
export type VoteProposal = OmitStrict<
  Proposal,
  'id' | 'description' | 'createdAt' | 'createdBy' | 'createdAtBlock' | 'proposedVersions'
> & {
  status: 'pending' | 'approved' | 'rejected' | 'canceled';
  createdBy: string; // this'll use the createdBy (Person) but simplifying for mocking
  votes: Vote[]; // this'll be subject to the API but will likely be an object with vote and id
  time?: string; // mocking with string for UI, but will likely be an end date and the distance to it
  endDate: DateValue; // this'll be the end date of the vote, using our DateValue for mocking purposes
};
