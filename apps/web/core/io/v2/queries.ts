import { EntitiesBatchQuery, EntityQuery, EntityTypesQuery, SpaceQuery, SpacesQuery } from '~/core/gql/graphql';
import { Entity } from '~/core/v2.types';

import { Space } from '../dto/spaces';
import { EntityDecoder, EntityTypeDecoder } from './decoders/entity';
import { SpaceDecoder } from './decoders/space';
import { entitiesBatchQuery, entitiesQuery, entityQuery, entityTypesQuery, spaceQuery } from './fragments';
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
    query: spaceQuery,
    decoder: data => data.spaces.map(SpaceDecoder.decode).filter(e => e !== null) ?? [],
    variables: { limit, offset, spaceIds },
    signal,
  });
}
