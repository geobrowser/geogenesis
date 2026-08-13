import { cache } from 'react';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { Spaces } from '~/core/utils/space';

import { cachedFetchSpace } from '../cached-fetch-space';

// Single source of truth for whether a space renders a side rail, shared by the
// layout (which reserves the rail width) and the page (which renders the rail
// contents).
export const resolveSpaceSidebar = cache(async (spaceId: string) => {
  const isRootSpace = spaceId === ROOT_SPACE;
  const space = await cachedFetchSpace(spaceId);
  const communityCalls = isRootSpace ? [] : await fetchCommunityCalls(spaceId).catch(() => []);
  const hasSidebar = !Spaces.hasExternalTopic(space) && (isRootSpace || communityCalls.length > 0);

  return { isRootSpace, communityCalls, hasSidebar };
});
