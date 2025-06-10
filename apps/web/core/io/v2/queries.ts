import { EntitiesBatchQuery, EntityQuery } from '~/core/gql/graphql';
import { Entity } from '~/core/v2.types';

import { EntityDecoder } from './entity';
import { entitiesBatchQuery, entityQuery } from './fragments';
import { graphql } from './graphql';

export function getBatchEntities(entityIds: string[], spaceId?: string, signal?: AbortController['signal']) {
  return graphql<EntitiesBatchQuery, Entity[]>({
    query: entitiesBatchQuery,
    decoder: data => data.entities.map(EntityDecoder.decode),
    variables: { ids: entityIds, spaceId },
    signal,
  });
}

export function getEntity(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql<EntityQuery, Entity>({
    query: entityQuery,
    decoder: data => EntityDecoder.decode(data.entity),
    variables: { id: entityId, spaceId },
    signal,
  });
}
