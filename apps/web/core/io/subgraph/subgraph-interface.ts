import { Entity, Profile, Proposal, ProposedVersion, Space, Triple } from '~/core/types';

import { FetchEntitiesOptions } from './fetch-entities';
import { FetchEntityOptions } from './fetch-entity';
import { FetchProfileOptions } from './fetch-profile';
import { FetchProposalOptions } from './fetch-proposal';
import { FetchProposalsOptions } from './fetch-proposals';
import { FetchProposedVersionsOptions } from './fetch-proposed-versions';
import { FetchSpaceOptions } from './fetch-space';
import { FetchSpacesOptions } from './fetch-spaces';
import { FetchTriplesOptions } from './fetch-triples';

export interface ISubgraph {
  fetchTriples: (options: FetchTriplesOptions) => Promise<Triple[]>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<Entity[]>;
  fetchSpaces: (options: FetchSpacesOptions) => Promise<Space[]>;
  fetchSpace: (options: FetchSpaceOptions) => Promise<Space | null>;
  fetchEntity: (options: FetchEntityOptions) => Promise<Entity | null>;
  fetchProfile: (options: FetchProfileOptions) => Promise<[string, Profile] | null>;
  fetchProposals: (options: FetchProposalsOptions) => Promise<Proposal[]>;
  fetchProposal: (options: FetchProposalOptions) => Promise<Proposal | null>;
  fetchProposedVersions: (options: FetchProposedVersionsOptions) => Promise<ProposedVersion[]>;
}
