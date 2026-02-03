import { Effect } from 'effect';
import { notFound } from 'next/navigation';

import { cache } from 'react';

import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { Profile } from '~/core/types';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

type EditorsForSpace = {
  firstThreeEditors: Profile[];
  totalEditors: number;
};

export const getFirstThreeEditorsForSpace = cache(async (spaceId: string): Promise<EditorsForSpace> => {
  const space = await cachedFetchSpace(spaceId);

  if (!space) {
    console.error(`Space does not exist: ${spaceId}`);
    notFound();
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const firstThreeEditors = space.editors.slice(0, 3);
  const firstThreeProfiles = await Effect.runPromise(fetchProfilesBySpaceIds(firstThreeEditors));

  return {
    firstThreeEditors: firstThreeProfiles,
    // @TODO: Use total count from graphql
    totalEditors: space.editors.length,
  };
});
