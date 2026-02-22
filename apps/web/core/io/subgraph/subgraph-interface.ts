import { Effect } from 'effect';

import { Profile } from '~/core/types';

import { Proposal, ProposalWithoutVoters } from '../dto/proposals';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';

export interface ISubgraph {
  fetchProfile: (walletAddress: string) => Effect.Effect<Profile, never, never>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<ProposalWithoutVoters[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
}
