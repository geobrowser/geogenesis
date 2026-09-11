import { cache } from 'react';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';
import { reportError } from '~/core/telemetry/logger';
import { Spaces } from '~/core/utils/space';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, withTimeout } from '~/core/utils/with-timeout';

import { cachedFetchSpace } from '../cached-fetch-space';

/**
 * Header-width seed for the space chrome. Rail *contents* are chosen per page:
 * root → Explore panel (streamed); other spaces → SpaceOverviewSidePanel.
 *
 * Seeded on what every route carrying this rail renders, which is community calls. The
 * Overview-only sections are deliberately not in it: daily activities are client-only, and
 * subspaces are fetched by the Overview page itself (see {@link fetchOverviewSubspaces}). Counting
 * an Overview-only section here would seed `/community` — which shares this layout and renders
 * neither — at the wider width, and the header would then jump once the client reported an empty
 * rail.
 */
export const resolveSpaceSidebar = cache(async (spaceId: string) => {
  const isRootSpace = spaceId === ROOT_SPACE;
  const space = await cachedFetchSpace(spaceId);
  // Bounded, not just caught. This is awaited by the `(space)` layout, so it gates every route
  // beneath it — a wedged upstream here is a blank space page, not a rail without calls.
  const communityCalls = isRootSpace
    ? []
    : await withTimeout(
        fetchCommunityCalls(spaceId).catch(() => []),
        SIDE_RAIL_FETCH_TIMEOUT_MS,
        []
      );
  const isExternalTopic = Spaces.hasExternalTopic(space);
  const hasSidebar = !isExternalTopic && !isRootSpace && communityCalls.length > 0;

  return { isRootSpace, isExternalTopic, communityCalls, hasSidebar };
});

/**
 * The space's subspaces, for the Overview rail (GEO-2875).
 *
 * Deliberately *not* part of {@link resolveSpaceSidebar}: the `(space)` layout awaits that, so
 * anything inside it lands on the critical path of every route beneath it — /community, /claims,
 * /debates and every `?tabId=` tab — for a section only Overview renders. Root would feel it
 * worst, having no other fetch there at all.
 *
 * Fails soft, which is why this is a function rather than an inline call. `fetchSubtopics` throws
 * on any transport blip, and while this ran uncaught above the editor a retryable upstream failure
 * became a render error on the space page — GEOGENESIS-1T, 1,945 of them, nearly all on `/root`.
 * Reported as handled: the signal is worth keeping, an unhandled render crash is not.
 */
export const fetchOverviewSubspaces = cache(async (spaceId: string) => {
  const subspaces = fetchSubtopics(spaceId).catch(error => {
    reportError(error, { tags: { surface: 'space-sidebar-subspaces' }, contexts: { space: { spaceId } } });
    return [];
  });

  // Bounded as well as caught: the containers that call this hold the whole rail behind it, so an
  // upstream that never answers would keep community calls and daily activities off the screen
  // too, behind a Suspense fallback that never resolves.
  return withTimeout(subspaces, SIDE_RAIL_FETCH_TIMEOUT_MS, []);
});
