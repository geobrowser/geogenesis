import { Effect } from 'effect';

import { cache } from 'react';

import { getSpace } from '~/core/io/v2/queries';

export const cachedFetchSpace = cache(async (spaceId: string) => {
  return Effect.runPromise(getSpace(spaceId));
});
