import { Effect } from 'effect';

import { cache } from 'react';

import { getSpaces } from '~/core/io/queries';

export const cachedFetchSpacesById = cache(async (spaceIds: string[]) => {
  return Effect.runPromise(getSpaces({ spaceIds }));
});
