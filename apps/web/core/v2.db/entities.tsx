import { createQueryCollection } from '@tanstack/db-collections';
import { useLiveQuery } from '@tanstack/react-db';
import { Schema } from 'effect';
import request from 'graphql-request';

import { useState } from 'react';

import { getConfig } from '../environment/environment';
import { AllEntitiesQuery, EntityQuery } from '../gql/graphql';
import { EntityDtoLive } from '../io/dto/entities';
import { entitiesQuery, entityQuery } from '../io/v2/fragments';
import { Entity as EntitySchema } from '../io/v2/v2.schema';
import { queryClient } from '../query-client';
import { Entity } from '../v2.types';

const entitiesCollection = createQueryCollection<Entity>({
  queryKey: ['db', 'entities'],
  queryFn: async () => {
    const { entities } = await request<AllEntitiesQuery>(getConfig().api, entitiesQuery, {
      limit: 50,
    });

    const result = entities
      .map(e => Schema.decodeUnknownSync(EntitySchema)(e, { errors: 'all' }))
      .map(e => EntityDtoLive(e));

    console.log('Entities loaded:', result.length);

    return result;
  },
  getId: entity => entity.id,
  // @ts-expect-error not modeling our app types as schema yet
  schema: Schema.standardSchemaV1(EntitySchema),
  // @ts-expect-error I think db expects query-core query client but we're using react-query
  queryClient: queryClient,
});

const makeEntityIdCollection = (id: string) => {
  return createQueryCollection<Entity>({
    queryKey: ['db', 'entity'],
    queryFn: async () => {
      const { entity } = await request<EntityQuery>(getConfig().api, entityQuery, {
        id: id,
      });

      if (!entity) {
        return [];
      }

      console.log('gottem', entity);

      const decoded = Schema.decodeUnknownSync(EntitySchema)(entity, { errors: 'all' });
      const mapped = EntityDtoLive(decoded);

      return [mapped];
    },
    getId: entity => entity.id,
    // @ts-expect-error not modeling our app types as schema yet
    schema: Schema.standardSchemaV1(EntitySchema),
    // @ts-expect-error I think db expects query-core query client but we're using react-query
    queryClient: queryClient,
  });
};

export function useEntity(id: string): Entity | null {
  const [collection] = useState(() => makeEntityIdCollection(id));

  const { data: entity } = useLiveQuery(q =>
    q.from({ collection }).where('id', '=', id).select('@*').keyBy('@id').limit(1).orderBy('@name')
  );

  return entity ? (entity[0] as Entity) : null;
}

export function useEntities() {
  const { data: entities } = useLiveQuery(q =>
    q.from({ entitiesCollection }).where('name', '!=', null).select('@name', '@id').keyBy('@id')
  );

  return entities ? (entities as Entity[]) : [];
}
