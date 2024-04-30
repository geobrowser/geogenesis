import { cache } from 'react';

import { Subgraph } from '~/core/io';
import { OmitStrict, Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type EditorsForSpace = {
  allEditors: OmitStrict<Profile, 'coverUrl'>[];
  totalEditors: number;
  votingPluginAddress: string | null;
  spacePluginAddress: string | null;
  memberPluginAddress: string | null;
};

export const getEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    throw new Error("Space doesn't exist");
  }

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
    votingPluginAddress: space.mainVotingPluginAddress,
    spacePluginAddress: space.spacePluginAddress,
    memberPluginAddress: space.memberAccessPluginAddress,
  };
});
