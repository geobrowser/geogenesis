import { Effect } from 'effect';

import { cache } from 'react';

import { getSpaces } from '~/core/io/v2/queries';

export const cachedFetchSpacesById = cache(async (spaceIds: string[]) => {
  return Effect.runPromise(getSpaces({ spaceIds }));
});
