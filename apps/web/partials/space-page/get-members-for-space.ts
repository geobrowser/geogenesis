import { notFound } from 'next/navigation';

import { cache } from 'react';

import { fetchProfileBySpaceId } from '~/core/io/subgraph';
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

  const memberProfiles = await Promise.all(space.members.map(memberSpaceId => fetchProfileBySpaceId(memberSpaceId)));

  return {
    allMembers: memberProfiles,
    totalMembers: space.members.length,
  };
});
