import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MembersForSpace = {
  allMembers: Profile[];
  totalMembers: number;
  votingPluginAddress: string | null;
  spacePluginAddress: string | null;
  memberPluginAddress: string | null;
};

export const getMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  const memberProfiles = await Promise.all(space.members.map(member => fetchProfile({ address: member })));

  return {
    allMembers: memberProfiles,
    totalMembers: space.members.length,
    votingPluginAddress: space.mainVotingPluginAddress,
    spacePluginAddress: space.spacePluginAddress,
    memberPluginAddress: space.memberAccessPluginAddress,
  };
});
