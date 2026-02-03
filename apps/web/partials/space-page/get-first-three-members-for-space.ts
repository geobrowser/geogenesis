import { notFound } from 'next/navigation';

import { cache } from 'react';

import { Effect } from 'effect';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MembersForSpace = {
  firstThreeMembers: Profile[];
  totalMembers: number;
};

export const getFirstThreeMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  const firstThreeMembers = space.members.slice(0, 3);
  const firstThreeProfiles = await Effect.runPromise(fetchProfilesBySpaceIds(firstThreeMembers));

  return {
    firstThreeMembers: firstThreeProfiles,
    // @TODO: Use total count from graphql
    totalMembers: space.members.length,
  };
});
