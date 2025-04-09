import { cache } from 'react';

import { fetchEntity } from '~/core/io/subgraph';
import { fetchEntitiesBatch } from '~/core/io/subgraph/fetch-entities-batch';

export const cachedFetchEntity = cache(async (entityId: string, spaceId?: string) => {
  return fetchEntity({ id: entityId, spaceId });
});

export const cachedFetchEntitiesBatch = cache(async (entityIds: string[]) => {
  return fetchEntitiesBatch({ entityIds });
});
