import { cache } from 'react';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { Spaces } from '~/core/utils/space';

import { cachedFetchSpace } from '../cached-fetch-space';

/**
 * Header-width seed for the space chrome. Rail *contents* are chosen per page:
 * root → Explore panel (streamed); other spaces → SpaceOverviewSidePanel.
 */
export const resolveSpaceSidebar = cache(async (spaceId: string) => {
  const isRootSpace = spaceId === ROOT_SPACE;
  const space = await cachedFetchSpace(spaceId);
  const communityCalls = isRootSpace ? [] : await fetchCommunityCalls(spaceId).catch(() => []);
  const isExternalTopic = Spaces.hasExternalTopic(space);
  const hasSidebar = !isExternalTopic && !isRootSpace && communityCalls.length > 0;

  return { isRootSpace, isExternalTopic, communityCalls, hasSidebar };
});
