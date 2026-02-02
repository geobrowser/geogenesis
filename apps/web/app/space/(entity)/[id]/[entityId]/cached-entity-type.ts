import { Effect } from 'effect';

import { cache } from 'react';

import { getEntityTypes } from '~/core/io/queries';

export const cachedFetchEntityType = cache(async (entityId: string) => {
  return await Effect.runPromise(getEntityTypes(entityId));
});
