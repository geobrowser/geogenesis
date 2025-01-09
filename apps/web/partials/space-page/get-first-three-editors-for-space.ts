import { cache } from 'react';

import { fetchProfilesByAddresses } from '~/core/io/subgraph/fetch-profiles-by-ids';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type EditorsForSpace = {
  firstThreeEditors: Profile[];
  totalEditors: number;
};

export const getFirstThreeEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const firstThreeEditors = space.editors.slice(0, 3);
  const firstThreeProfiles = await fetchProfilesByAddresses(firstThreeEditors);

  return {
    firstThreeEditors: firstThreeProfiles,
    // @TODO: Use total count from graphql
    totalEditors: space.editors.length,
  };
});
