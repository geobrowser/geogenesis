import { exploreSidePanelHasServerContent } from '~/core/explore/explore-side-panel-has-content';
import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';

import { ExploreSidePanel } from './explore-side-panel';

/**
 * Async server component that self-fetches the explore side panel data so the
 * root space shell can stream
 */
export async function RootExploreSidePanelContainer() {
  const data = await fetchExploreSidePanelData().catch(() => null);

  if (!data || !exploreSidePanelHasServerContent(data)) {
    return null;
  }

  return (
    <ExploreSidePanel
      featuredSpaces={data.featuredSpaces}
      featuredRankings={data.featuredRankings}
      pendingMembershipSpaceIds={data.pendingMembershipSpaceIds}
      memberOrEditorSpaceIds={data.memberOrEditorSpaceIds}
      communityCalls={data.communityCalls}
    />
  );
}
