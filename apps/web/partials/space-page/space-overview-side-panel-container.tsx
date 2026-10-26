import { SpaceOverviewSidePanel } from './space-overview-side-panel';
import { fetchOverviewSubspaces, resolveSpaceSidebar } from '~/app/space/[id]/(space)/space-sidebar';

type Props = {
  spaceId: string;
};

/**
 * Fetches the Overview rail's subspaces and community calls and hands them to the panel (GEO-2875).
 *
 * A container rather than an `await` in the page, because the page's own `await` blocks *all* of
 * its JSX — the editor included — on a query that only the rail needs. The gallery this replaces
 * was never on that path: it sat under its own Suspense boundary, so a slow or hung subgraph
 * delayed one section rather than the whole overview. `fetchOverviewSubspaces` catching its errors
 * does not help with that; a request that never settles is not a rejected one.
 *
 * Mirrors {@link RootExploreSidePanelContainer}, which already streams the root rail this way.
 */
export async function SpaceOverviewSidePanelContainer({ spaceId }: Props) {
  const [subspaces, { communityCalls }] = await Promise.all([
    fetchOverviewSubspaces(spaceId),
    resolveSpaceSidebar(spaceId),
  ]);

  return (
    <SpaceOverviewSidePanel spaceId={spaceId} dailyActivities communityCalls={communityCalls} subspaces={subspaces} />
  );
}
