import { cache } from 'react';

import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { ROOT_SPACE } from '~/core/constants';
import { fetchSubtopics } from '~/core/io/subgraph/fetch-subtopics';
import { reportError } from '~/core/telemetry/logger';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, resolveWithin } from '~/core/utils/resolve-within';
import { Spaces } from '~/core/utils/space';

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
    : // No signal, deliberately. `fetchCommunityCalls` is `cache()`d and the Community tab awaits the
      // same memoised promise this starts, so cancelling on this deadline would reject *its* await
      // too. Bounded without being cancelled: the render is protected, the request is left to finish
      // for whoever else is waiting on it.
      await resolveWithin(() => fetchCommunityCalls(spaceId).catch(() => []), SIDE_RAIL_FETCH_TIMEOUT_MS, []);
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
export const fetchOverviewSubspaces = cache((spaceId: string) =>
  // Bounded as well as caught: the containers that call this hold the whole rail behind it, so an
  // upstream that never answers would keep community calls and daily activities off the screen
  // too, behind a Suspense fallback that never resolves. The signal is threaded, so a request this
  // deadline gives up on is cancelled rather than left running.
  resolveWithin(
    // Safe to cancel: this is `cache()`d, and exactly one container calls it per request — root's
    // or the space's, never both. A second caller in the same render would change that, since the
    // first deadline to fire would abort the promise the other is awaiting.
    signal =>
      fetchSubtopics(spaceId, signal).catch(error => {
        // Our own deadline firing is not an upstream fault, and reporting it would fill the error
        // tracker during exactly the outage the deadline exists to survive.
        if (signal.aborted) return [];
        reportError(error, { tags: { surface: 'space-sidebar-subspaces' }, contexts: { space: { spaceId } } });
        return [];
      }),
    SIDE_RAIL_FETCH_TIMEOUT_MS,
    []
  )
);
