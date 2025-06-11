import { EntitiesBatchQuery, EntityQuery, EntityTypesQuery } from '~/core/gql/graphql';
import { Entity } from '~/core/v2.types';

import { EntityDecoder, EntityTypeDecoder } from './entity';
import { entitiesBatchQuery, entityQuery, entityTypesQuery } from './fragments';
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
