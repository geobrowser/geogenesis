import { Profile, Triple } from '~/core/types';
import { Entity, SearchResult } from '~/core/v2.types';

import { Proposal, ProposalWithoutVoters } from '../dto/proposals';
import { FetchProfileOptions } from './fetch-profile';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';
import { FetchResultsOptions } from './fetch-results';
import { FetchTableRowEntitiesOptions } from './fetch-table-row-entities';
import { FetchTriplesOptions } from './fetch-triples';

export interface ISubgraph {
  fetchTriples: (options: FetchTriplesOptions) => Promise<Triple[]>;
  fetchResults: (options: FetchResultsOptions) => Promise<SearchResult[]>;
  fetchProfile: (options: FetchProfileOptions) => Promise<Profile | null>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<ProposalWithoutVoters[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
  fetchTableRowEntities: (options: FetchTableRowEntitiesOptions) => Promise<Entity[]>;
}
