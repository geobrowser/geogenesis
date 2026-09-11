import { cache } from 'react';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';
import { reportError } from '~/core/telemetry/logger';
import { Spaces } from '~/core/utils/space';

import { cachedFetchSpace } from '../cached-fetch-space';

/**
 * Header-width seed for the space chrome. Rail *contents* are chosen per page:
 * root → Explore panel (streamed); other spaces → SpaceOverviewSidePanel.
 */
export const resolveSpaceSidebar = cache(async (spaceId: string) => {
  const isRootSpace = spaceId === ROOT_SPACE;
  const space = await cachedFetchSpace(spaceId);
  const isExternalTopic = Spaces.hasExternalTopic(space);
  const [communityCalls, subspaces] = await Promise.all([
    isRootSpace ? [] : fetchCommunityCalls(spaceId).catch(() => []),
    // Subspaces are decoration, and decoration must not take the page down with it. `fetchSubtopics`
    // throws on any transport failure, and when this was an un-caught async Server Component above
    // the editor a retryable upstream blip became a render error on the space page — GEOGENESIS-1T,
    // 1,945 of them, nearly all on `/root`. Reported as handled: the signal is worth keeping.
    fetchSubtopics(spaceId).catch(error => {
      reportError(error, { tags: { surface: 'space-sidebar-subspaces' }, contexts: { space: { spaceId } } });
      return [];
    }),
  ]);
  const hasSidebar = !isExternalTopic && !isRootSpace && (communityCalls.length > 0 || subspaces.length > 0);

  return { isRootSpace, isExternalTopic, communityCalls, subspaces, hasSidebar };
});
