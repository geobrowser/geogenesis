import { cache } from 'react';

import { Subgraph } from '~/core/io';
import { OmitStrict, Profile } from '~/core/types';

type EditorsForSpace = {
  allEditors: OmitStrict<Profile, 'coverUrl'>[];
  totalEditors: number;
};

export const getEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await Subgraph.fetchSpace({ id: spaceId });

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const maybeEditorsProfiles = await Promise.all(
    space.editors.map(editor => Subgraph.fetchProfile({ address: editor }))
  );

  const allEditors = maybeEditorsProfiles.map(profile => {
    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      avatarUrl: profile.avatarUrl,
      name: profile.name,
      address: profile.address,
      profileLink: profile.profileLink,
    };
  });

  const allEditorsWithProfiles = allEditors.filter((editor): editor is Profile => editor !== null);

  return {
    allEditors: allEditorsWithProfiles,
    totalEditors: space.editors.length,
  };
});
