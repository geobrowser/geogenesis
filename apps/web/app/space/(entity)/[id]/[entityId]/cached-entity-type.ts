import { cache } from 'react';

import { fetchEntityType } from '~/core/io/fetch-entity-type';

export const cachedFetchEntityType = cache(async (entityId: string) => {
  return fetchEntityType({ id: entityId });
});
