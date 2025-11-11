import { Effect } from 'effect';

import { cache } from 'react';

import { getSpace } from '~/core/io/v2/queries';

import { Telemetry } from '~/app/api/telemetry';

export const cachedFetchSpace = cache(async (spaceId: string) => {
  return Effect.runPromise(
    getSpace(spaceId).pipe(
      Effect.withSpan('web.cachedFetchSpace'),
      Effect.annotateSpans({ spaceId }),
      Effect.provide(Telemetry)
    )
  );
});
