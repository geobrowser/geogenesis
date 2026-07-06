import { cache } from 'react';

import { Effect } from 'effect';

import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

import { type SpaceAccess, getSpaceAccess, noSpaceAccess } from './space-access';
import { Telemetry } from '~/app/api/telemetry';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

const getCachedPersonalSpaceId = cache(async (walletAddress: string) => getPersonalSpaceId(walletAddress));

/**
 * Request-scoped space access for server components: resolves the connected
 * wallet's personal space and evaluates getSpaceAccess once per request
 * regardless of how many components ask.
 */
export const getSpaceAccessForRequest = cache(
  async (spaceId: string, connectedAddress?: string): Promise<SpaceAccess> => {
    if (!connectedAddress) {
      return noSpaceAccess;
    }

    const [space, personalSpaceId] = await Promise.all([
      cachedFetchSpace(spaceId),
      getCachedPersonalSpaceId(connectedAddress),
    ]);

    if (!space || !personalSpaceId) {
      return noSpaceAccess;
    }

    return Effect.runPromise(
      getSpaceAccess(space, personalSpaceId).pipe(
        Effect.withSpan('web.getSpaceAccessForRequest'),
        Effect.annotateSpans({ spaceId, personalSpaceId }),
        Effect.provide(Telemetry)
      )
    );
  }
);
