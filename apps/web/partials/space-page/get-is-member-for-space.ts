import { cache } from 'react';

import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { getSpaceAccess } from '~/core/access/space-access';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

import { Telemetry } from '~/app/api/telemetry';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

export const getIsMemberForSpace = cache(async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  if (!connectedAddress) {
    return false;
  }

  const personalSpaceId = await getPersonalSpaceId(connectedAddress);

  if (!personalSpaceId) {
    return false;
  }

  return Effect.runPromise(
    getSpaceAccess(space, personalSpaceId.toLowerCase()).pipe(
      Effect.map(access => access.isMember),
      Effect.withSpan('web.getIsMemberForSpace'),
      Effect.annotateSpans({ spaceId, personalSpaceId }),
      Effect.provide(Telemetry)
    )
  );
});
