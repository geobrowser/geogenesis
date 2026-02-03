import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { cache } from 'react';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MembersForSpace = {
  allMembers: Profile[];
  totalMembers: number;
};

export const getMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  const memberProfiles = await Effect.runPromise(fetchProfilesBySpaceIds(space.members));

  return {
    allMembers: memberProfiles,
    totalMembers: space.members.length,
  };
});
