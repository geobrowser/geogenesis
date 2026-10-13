import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, resolveWithin } from '~/core/utils/resolve-within';

import { ExploreSidePanel } from './explore-side-panel';

/**
 * Async server component for the Explore rail, rendered inside a Suspense boundary so the page and
 * its feed stream out without waiting on it. Before this the route awaited the rail's data, so
 * every load sat on featured spaces, rankings, calls and — signed in — a membership check per
 * featured space before sending any HTML, including while the rail itself was flagged off.
 *
 * Bounded like {@link RootExploreSidePanelContainer}: a request that never answers leaves the rail
 * empty rather than holding its boundary open.
 */
export async function ExploreSidePanelContainer() {
  const data = await resolveWithin(
    () => fetchExploreSidePanelData().catch(() => null),
    SIDE_RAIL_FETCH_TIMEOUT_MS,
    null
  );

  return (
    <ExploreSidePanel
      featuredSpaces={data?.featuredSpaces ?? []}
      featuredRankings={data?.featuredRankings ?? []}
      pendingMembershipSpaceIds={data?.pendingMembershipSpaceIds ?? []}
      memberOrEditorSpaceIds={data?.memberOrEditorSpaceIds ?? []}
      communityCalls={data?.communityCalls ?? []}
    />
  );
}
