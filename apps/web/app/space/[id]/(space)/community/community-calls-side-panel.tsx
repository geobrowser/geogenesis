import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { SIDE_RAIL_FETCH_TIMEOUT_MS, resolveWithin } from '~/core/utils/resolve-within';

import { SpaceOverviewSidePanel } from '~/partials/space-page/space-overview-side-panel';

export async function CommunityCallsSidePanel({ spaceId }: { spaceId: string }) {
  return (
    <SpaceOverviewSidePanel
      spaceId={spaceId}
      communityCalls={await resolveWithin(
        () => fetchCommunityCalls(spaceId).catch(() => []),
        SIDE_RAIL_FETCH_TIMEOUT_MS,
        []
      )}
    />
  );
}
