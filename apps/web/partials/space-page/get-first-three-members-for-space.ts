import { cache } from 'react';

import { Subgraph } from '~/core/io';
import { OmitStrict, Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type MembersForSpace = {
  firstThreeMembers: OmitStrict<Profile, 'coverUrl'>[];
  totalMembers: number;
};

export const getFirstThreeMembersForSpace = cache(async (spaceId: string): Promise<MembersForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  const maybeEditorsProfiles = await Promise.all(
    space.members.slice(0, 3).map(editor => Subgraph.fetchProfile({ address: editor }))
  );

  const firstThreeMembers = maybeEditorsProfiles.map((profile, i) => {
    if (!profile) {
      return {
        id: space.editors[i],
        avatarUrl: null,
        name: null,
        address: space.editors[i] as `0x${string}`,
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
  });

  return {
    firstThreeMembers,
    // @TODO: Use total count from graphql
    totalMembers: space.members.length,
  };
});
