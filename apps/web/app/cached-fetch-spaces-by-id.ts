import { cache } from 'react';

import { Effect } from 'effect';

import { getSpaces } from '~/core/io/queries';

export const cachedFetchSpacesById = cache(async (spaceIds: string[]) => {
  return Effect.runPromise(getSpaces({ spaceIds }));
});
