import { cache } from 'react';

import { fetchSpacesById } from '~/core/io/subgraph/fetch-spaces-by-id';

export const cachedFetchSpacesById = cache(async (spaceIds: string[]) => {
  return fetchSpacesById(spaceIds);
});
