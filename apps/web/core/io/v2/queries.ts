import {
  EntitiesBatchQuery,
  EntityQuery,
  EntityTypesQuery,
  ResultQuery,
  ResultsQuery,
  SpaceQuery,
  SpacesQuery,
} from '~/core/gql/graphql';
import { Entity, SearchResult } from '~/core/v2.types';

import { Space } from '../dto/spaces';
import { EntityDecoder, EntityTypeDecoder } from './decoders/entity';
import { ResultDecoder } from './decoders/result';
import { SpaceDecoder } from './decoders/space';
import {
  entitiesBatchQuery,
  entitiesQuery,
  entityQuery,
  entityTypesQuery,
  resultQuery,
  resultsQuery,
  spaceQuery,
  spacesQuery,
} from './fragments';
import { graphql } from './graphql';

// @TODO(migration): Can we somehow bind the querying patterns to the sync store?
// When we querying for things on the client we want them to populate the sync store
// automatically...
//
// We also want to merge local data as much as possible

export function getBatchEntities(entityIds: string[], spaceId?: string, signal?: AbortController['signal']) {
  return graphql<EntitiesBatchQuery, Entity[]>({
    query: entitiesBatchQuery,
    decoder: data => data.entities.map(EntityDecoder.decode).filter(e => e !== null),
    variables: { ids: entityIds, spaceId },
    signal,
  });
}

export function getAllEntities(spaceId?: string, signal?: AbortController['signal']) {
  return graphql<EntitiesBatchQuery, Entity[]>({
    query: entitiesQuery,
    decoder: data => data.entities.map(EntityDecoder.decode).filter(e => e !== null),
    variables: { spaceId },
    signal,
  });
}

export function getEntity(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql<EntityQuery, Entity | null>({
    query: entityQuery,
    decoder: data => (data.entity ? EntityDecoder.decode(data.entity) : null),
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getEntityTypes(entityId: string, signal?: AbortController['signal']) {
  return graphql<EntityTypesQuery, { id: string; name: string | null }[]>({
    query: entityTypesQuery,
    decoder: data => data.entity?.types.map(EntityTypeDecoder.decode).filter(e => e !== null) ?? [],
    variables: { id: entityId },
    signal,
  });
}

export function getSpace(spaceId: string, signal?: AbortController['signal']) {
  return graphql<SpaceQuery, Space | null>({
    query: spaceQuery,
    decoder: data => (data.space ? SpaceDecoder.decode(data.space) : null),
    variables: { id: spaceId },
    signal,
  });
}

export function getSpaces(
  { limit, offset, spaceIds }: { limit?: number; offset?: number; spaceIds?: string[] } = {},
  signal?: AbortController['signal']
) {
  return graphql<SpacesQuery, Space[]>({
    query: spacesQuery,
    decoder: data => data.spaces.map(SpaceDecoder.decode).filter(e => e !== null) ?? [],
    variables: { limit, offset, spaceIds },
    signal,
  });
}

export function getResult(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql<ResultQuery, SearchResult | null>({
    query: resultQuery,
    decoder: data => {
      return data.entity ? ResultDecoder.decode(data.entity) : null;
    },
    variables: { id: entityId, spaceId },
    signal,
  });
}

interface ResultsArgs {
  query: string;
  spaceIds?: string[];
  typeIds?: string[];
}

export function getResults(args: ResultsArgs, signal?: AbortController['signal']) {
  return graphql<ResultsQuery, SearchResult[]>({
    query: resultsQuery,
    decoder: data => {
      return data.search.map(ResultDecoder.decode).filter(r => r !== null);
    },
    variables: { query: args.query },
    signal,
  });
}
