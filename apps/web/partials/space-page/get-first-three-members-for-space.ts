import { cache } from 'react';

import { fetchProfilesByAddresses } from '~/core/io/subgraph/fetch-profiles-by-ids';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MembersForSpace = {
  firstThreeMembers: Profile[];
  totalMembers: number;
};

export const getFirstThreeMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  const firstThreeMembers = space.members.slice(0, 3);
  const firstThreeProfiles = await fetchProfilesByAddresses(firstThreeMembers);

  return {
    firstThreeMembers: firstThreeProfiles,
    // @TODO: Use total count from graphql
    totalMembers: space.members.length,
  };
});
