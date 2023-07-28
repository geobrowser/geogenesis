import { Entity, Profile, Space, Triple } from '~/core/types';

import { FetchEntitiesOptions } from './fetch-entities';
import { FetchEntityOptions } from './fetch-entity';
import { FetchProfileOptions } from './fetch-profile';
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
}
