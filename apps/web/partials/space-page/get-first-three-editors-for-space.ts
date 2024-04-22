import { cache } from 'react';

import { Subgraph } from '~/core/io';
import { OmitStrict, Profile } from '~/core/types';

type EditorsForSpace = {
  firstThreeEditors: OmitStrict<Profile, 'coverUrl'>[];
  totalEditors: number;
};

export const getFirstThreeEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await Subgraph.fetchSpace({ id: spaceId });

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const maybeEditorsProfiles = await Promise.all(
    space.editors.slice(0, 3).map(editor => Subgraph.fetchProfile({ address: editor }))
  );

  const firstThreeEditors = maybeEditorsProfiles.map((profile, i) => {
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
    firstThreeEditors,
    totalEditors: space.editors.length,
  };
});
