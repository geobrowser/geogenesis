import { cache } from 'react';

import { fetchProfile } from '~/core/io/subgraph';
import { OmitStrict, Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type EditorProfile = OmitStrict<Profile, 'coverUrl'>;

type EditorsForSpace = {
  allEditors: EditorProfile[];
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

  const editorProfiles = await Promise.all(
    space.editors.map(async (editor): Promise<EditorProfile> => {
      const profile = await fetchProfile({ address: editor });

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
    allEditors: editorProfiles,
    totalEditors: space.editors.length,
    votingPluginAddress: space.mainVotingAddress,
    spacePluginAddress: space.spaceAddress,
    memberPluginAddress: space.membershipAddress,
  };
});
