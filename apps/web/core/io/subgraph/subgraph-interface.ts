import { Entity, OnchainProfile, Profile, Proposal, ProposedVersion, Space, Triple } from '~/core/types';

import { FetchEntitiesOptions } from './fetch-entities';
import { FetchEntityOptions } from './fetch-entity';
import { FetchOnchainProfileOptions } from './fetch-on-chain-profile';
import { FetchProfileOptions } from './fetch-profile';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';
import { FetchProposedVersionOptions } from './fetch-proposed-version';
import { FetchProposedVersionsOptions } from './fetch-proposed-versions';
import { FetchSpaceOptions } from './fetch-space';
import { FetchTableRowEntitiesOptions } from './fetch-table-row-entities';
import { FetchTriplesOptions } from './fetch-triples';

export interface ISubgraph {
  fetchTriples: (options: FetchTriplesOptions) => Promise<Triple[]>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<Entity[]>;
  fetchSpaces: () => Promise<Space[]>;
  fetchSpace: (options: FetchSpaceOptions) => Promise<Space | null>;
  fetchEntity: (options: FetchEntityOptions) => Promise<Entity | null>;
  fetchProfile: (options: FetchProfileOptions) => Promise<Profile | null>;
  fetchOnchainProfile: (options: FetchOnchainProfileOptions) => Promise<OnchainProfile | null>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<Proposal[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
  fetchProposedVersions: (options: FetchProposedVersionsOptions) => Promise<ProposedVersion[]>;
  fetchProposedVersion: (options: FetchProposedVersionOptions) => Promise<ProposedVersion | null>;
  fetchTableRowEntities: (options: FetchTableRowEntitiesOptions) => Promise<Entity[]>;
}
