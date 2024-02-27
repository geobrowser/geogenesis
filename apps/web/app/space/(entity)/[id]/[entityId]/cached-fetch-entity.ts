import { cache } from 'react';

import { fetchEntity } from '~/core/io/subgraph';

export const cachedFetchEntity = cache(async (entityId: string) => {
  return fetchEntity({ id: entityId });
});
