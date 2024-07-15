import { cache } from 'react';

import { Subgraph } from '~/core/io';
import { OmitStrict, Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MemberProfile = OmitStrict<Profile, 'coverUrl'>;

type MembersForSpace = {
  allMembers: MemberProfile[];
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

  const memberProfiles = await Promise.all(
    space.editors.map(async (editor): Promise<MemberProfile> => {
      const profile = await Subgraph.fetchProfile({ address: editor });
      if (!profile) {
        return {
          id: editor,
          avatarUrl: null,
          name: null,
          address: editor as `0x${string}`,
          profileLink: '',
        };
      }

      return {
        id: profile.id,
        avatarUrl: profile.avatarUrl,
        name: profile.name,
        address: profile.address,
        profileLink: profile.profileLink,
      };
    })
  );

  return {
    allMembers: memberProfiles,
    totalMembers: space.members.length,
    votingPluginAddress: space.mainVotingPluginAddress,
    spacePluginAddress: space.spacePluginAddress,
    memberPluginAddress: space.memberAccessPluginAddress,
  };
});
