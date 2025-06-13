import { Profile, Triple } from '~/core/types';
import { Entity } from '~/core/v2.types';

import { Proposal, ProposalWithoutVoters } from '../dto/proposals';
import { SearchResult } from '../dto/search';
import { FetchEntitiesOptions } from './fetch-entities';
import { FetchProfileOptions } from './fetch-profile';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';
import { FetchResultsOptions } from './fetch-results';
import { FetchTableRowEntitiesOptions } from './fetch-table-row-entities';
import { FetchTriplesOptions } from './fetch-triples';

export interface ISubgraph {
  fetchTriples: (options: FetchTriplesOptions) => Promise<Triple[]>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<Entity[]>;
  fetchResults: (options: FetchResultsOptions) => Promise<SearchResult[]>;
  fetchProfile: (options: FetchProfileOptions) => Promise<Profile | null>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<ProposalWithoutVoters[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
  fetchTableRowEntities: (options: FetchTableRowEntitiesOptions) => Promise<Entity[]>;
}
