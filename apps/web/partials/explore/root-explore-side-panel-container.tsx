import { fetchExploreSidePanelData } from '~/core/explore/fetch-explore-side-panel-data';

import { ExploreSidePanel } from './explore-side-panel';
import { fetchOverviewSubspaces } from '~/app/space/[id]/(space)/space-sidebar';

/**
 * Async server component that self-fetches the explore side panel data so the root space shell
 * can stream it into the same {@link ExploreSidePanel} the explore page uses — the root overview
 * rail is identical to the explore rail.
 */
export async function RootExploreSidePanelContainer({
  spaceId,
  includeSubspaces,
}: {
  spaceId: string;
  /**
   * Whether to fetch and show the root space's own subspaces (GEO-2875). Overview does; Community
   * shares this rail but is a tab, so it does not. Required rather than defaulted, so each caller
   * says which it is instead of inheriting an answer.
   */
  includeSubspaces: boolean;
}) {
  const [data, subspaces] = await Promise.all([
    fetchExploreSidePanelData().catch(() => null),
    includeSubspaces ? fetchOverviewSubspaces(spaceId) : [],
  ]);

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
