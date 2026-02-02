import { notFound, redirect } from 'next/navigation';

import { cache } from 'react';

import { fetchProfileBySpaceId } from '~/core/io/subgraph';
import { OmitStrict, Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type EditorProfile = OmitStrict<Profile, 'coverUrl'>;

type EditorsForSpace = {
  allEditors: EditorProfile[];
  totalEditors: number;
};

export const getEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  const editorProfiles = await Promise.all(
    space.editors.map(async (editor): Promise<EditorProfile> => {
      const profile = await fetchProfileBySpaceId(editor);

      if (!profile) {
        return {
          id: editor,
          spaceId: editor,
          avatarUrl: null,
          name: null,
          address: editor as `0x${string}`,
          profileLink: '',
        };
      }

      return {
        id: profile.id,
        spaceId: profile.spaceId,
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
  };
});
