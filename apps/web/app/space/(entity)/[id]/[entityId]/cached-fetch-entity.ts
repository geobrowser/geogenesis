import { Effect } from 'effect';

import { cache } from 'react';

import { getBatchEntities, getEntity, getEntityPage } from '~/core/io/v2/queries';

export const cachedFetchEntity = cache(async (entityId: string, spaceId?: string) => {
  return await Effect.runPromise(getEntity(entityId, spaceId));
});

export const cachedFetchEntityPage = cache(async (entityId: string, spaceId?: string) => {
  return await Effect.runPromise(getEntityPage(entityId, spaceId));
});

export const cachedFetchEntitiesBatch = cache(async (entityIds: string[], spaceId?: string) => {
  return await Effect.runPromise(getBatchEntities(entityIds, spaceId));
});
