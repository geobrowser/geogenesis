import { Effect } from 'effect';

import { cache } from 'react';

import { getEntityTypes } from '~/core/io/v2/queries';

export const cachedFetchEntityType = cache(async (entityId: string) => {
  return await Effect.runPromise(getEntityTypes(entityId));
});
