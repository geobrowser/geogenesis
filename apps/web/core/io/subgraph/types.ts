import { Entity, Space, Triple } from '~/core/types';

import { FetchEntitiesOptions } from './fetch-entities';
import { FetchEntityOptions } from './fetch-entity';
import { FetchSpaceOptions } from './fetch-space';
import { FetchSpacesOptions } from './fetch-spaces';
import { FetchTriplesOptions } from './fetch-triples';

export interface ISubgraph {
  fetchTriples: (options: FetchTriplesOptions) => Promise<Triple[]>;
  fetchEntities: (options: FetchEntitiesOptions) => Promise<Entity[]>;
  fetchSpaces: (options: FetchSpacesOptions) => Promise<Space[]>;
  fetchSpace: (options: FetchSpaceOptions) => Promise<Space>;
  fetchEntity: (options: FetchEntityOptions) => Promise<Entity | null>;
}
