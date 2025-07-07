import { Profile } from '~/core/types';

import { Proposal, ProposalWithoutVoters } from '../dto/proposals';
import { FetchProfileOptions } from './fetch-profile';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';

export interface ISubgraph {
  fetchProfile: (options: FetchProfileOptions) => Promise<Profile | null>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<ProposalWithoutVoters[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
}
