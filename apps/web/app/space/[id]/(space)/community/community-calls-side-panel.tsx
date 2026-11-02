import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, resolveWithin } from '~/core/utils/resolve-within';

import { SpaceOverviewSidePanel } from '~/partials/space-page/space-overview-side-panel';

import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

export async function CommunityCallsSidePanel({ spaceId }: { spaceId: string }) {
  const [space, communityCalls] = await Promise.all([
    resolveWithin(() => cachedFetchSpace(spaceId).catch(() => null), SIDE_RAIL_FETCH_TIMEOUT_MS, null),
    resolveWithin(() => fetchCommunityCalls(spaceId).catch(() => []), SIDE_RAIL_FETCH_TIMEOUT_MS, []),
  ]);

  return (
    <SpaceOverviewSidePanel
      spaceId={spaceId}
      spaceName={space?.entity?.name ?? undefined}
      communityCalls={communityCalls}
    />
  );
}
