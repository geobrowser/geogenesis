import { notFound } from 'next/navigation';

import { cache } from 'react';

import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

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

  return space.members.map(m => m.toLowerCase()).includes(personalSpaceId.toLowerCase());
});
