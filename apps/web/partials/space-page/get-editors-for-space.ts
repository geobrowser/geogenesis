import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { cache } from 'react';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
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

  const editorProfiles = await Effect.runPromise(fetchProfilesBySpaceIds(space.editors));

  return {
    allEditors: editorProfiles,
    totalEditors: space.editors.length,
  };
});
