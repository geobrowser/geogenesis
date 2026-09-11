import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';

import { ExploreSidePanel } from './explore-side-panel';

/**
 * Async server component that self-fetches the explore side panel data so the root space shell
 * can stream it into the same {@link ExploreSidePanel} the explore page uses — the root overview
 * rail is identical to the explore rail.
 */
export async function RootExploreSidePanelContainer({
  spaceId,
  subspaces,
}: {
  spaceId: string;
  /** The root space's own subspaces, which the Explore page itself has none of (GEO-2875). */
  subspaces: TopicUsage[];
}) {
  const data = await fetchExploreSidePanelData().catch(() => null);

  return (
    <ExploreSidePanel
      featuredSpaces={data?.featuredSpaces ?? []}
      featuredRankings={data?.featuredRankings ?? []}
      pendingMembershipSpaceIds={data?.pendingMembershipSpaceIds ?? []}
      memberOrEditorSpaceIds={data?.memberOrEditorSpaceIds ?? []}
      communityCalls={data?.communityCalls ?? []}
      spaceId={spaceId}
      subspaces={subspaces}
    />
  );
}
