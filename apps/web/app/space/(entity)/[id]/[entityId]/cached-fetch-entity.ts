import { Effect } from 'effect';

import { cache } from 'react';

import { getBatchEntities, getEntity, getEntityPage } from '~/core/io/queries';
import { Entity, Relation } from '~/core/types';

import { Telemetry } from '~/app/api/telemetry';

export const cachedFetchEntity = cache(async (entityId: string, spaceId?: string): Promise<Entity | null> => {
  return await Effect.runPromise(getEntity(entityId, spaceId));
});

export const cachedFetchEntityPage = cache(
  async (entityId: string, spaceId?: string): Promise<{ entity: Entity | null; relations: Relation[] } | null> => {
    return await Effect.runPromise(
      getEntityPage(entityId, spaceId).pipe(
        Effect.withSpan('web.cachedFetchEntityPage'),
        Effect.annotateSpans({ entityId, spaceId }),
        Effect.provide(Telemetry)
      )
    );
  }
);

export const cachedFetchEntitiesBatch = cache(async (entityIds: string[], spaceId?: string): Promise<Entity[]> => {
  return await Effect.runPromise(getBatchEntities(entityIds, spaceId));
});
