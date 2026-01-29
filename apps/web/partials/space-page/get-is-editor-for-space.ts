import { cache } from 'react';

import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

export const getIsEditorForSpace = cache(async (spaceId: string, connectedAddress?: string): Promise<boolean> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    return false;
  }

  if (!connectedAddress) {
    return false;
  }

  const personalSpaceId = await getPersonalSpaceId(connectedAddress);

  if (!personalSpaceId) {
    return false;
  }

  // For personal spaces, the owner is the editor
  if (space.type === 'PERSONAL') {
    return personalSpaceId === spaceId;
  }

  return space.editors.map(e => e.toLowerCase()).includes(personalSpaceId.toLowerCase());
});
