import { cache } from 'react';

import { fetchSpace } from '~/core/io/subgraph';

export const cachedFetchSpace = cache(async (spaceId: string) => {
  return fetchSpace({ id: spaceId });
});
