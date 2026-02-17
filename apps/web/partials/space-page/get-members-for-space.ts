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

const MAX_MEMBERS_TO_RENDER = 100;

export const getMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  const membersToRender = space.members.slice(0, MAX_MEMBERS_TO_RENDER);
  const memberProfiles = await Effect.runPromise(fetchProfilesBySpaceIds(membersToRender));

  return {
    allMembers: memberProfiles,
    totalMembers: space.members.length,
  };
});
