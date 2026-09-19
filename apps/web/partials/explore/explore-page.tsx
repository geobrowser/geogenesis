'use client';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

import { ExploreEmailCapturePopup } from './email-capture-popup';
import { ExploreSidePanel } from './explore-side-panel';
import { ExploreWelcomeBanner } from './explore-welcome-banner';

type Props = {
  initialSpaceOptions: SpaceOption[];
  /** Joined or pending — what the space filter opens on. */
  memberSpaceIds: string[];
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

export function ExplorePage({
  initialSpaceOptions,
  memberSpaceIds,
  featuredSpaces,
  featuredRankings,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
  communityCalls,
}: Props) {
  // GEO-2914. Hidden, not removed: the panel and everything in it is still built and still fed by
  // the page's own queries, so turning the flag on restores it without a deploy — and the tickets
  // still open against its contents have somewhere to land.
  //
  // The layout needs nothing else. `auto-sidebar` widens the container through `has-[aside]:`, so
  // with no `<aside>` rendered the content falls back to the full-width variant on its own rather
  // than holding an empty column open.
  const sidePanelEnabled = useFeatureFlag('exploreSidePanel');

  return (
    <EntityPageSidebarLayout
      sidebar={
        sidePanelEnabled ? (
          <ExploreSidePanel
            featuredSpaces={featuredSpaces}
            featuredRankings={featuredRankings}
            pendingMembershipSpaceIds={pendingMembershipSpaceIds}
            memberOrEditorSpaceIds={memberOrEditorSpaceIds}
            communityCalls={communityCalls}
          />
        ) : null
      }
    >
      {/* Fixed-position, so it sits outside the column rather than in the feed's flow — and ahead
          of it in the DOM, because that is where it is on screen. Mounted after the feed it was
          reachable only by tabbing an infinite list to the end, which for a keyboard reader is not
          reachable at all. It renders nothing until it is shown, so it costs the tab order
          nothing the rest of the time. */}
      <ExploreEmailCapturePopup />
      <main className="min-w-0 pt-5">
        <div className="mx-auto w-full max-w-[880px]">
          <ExploreWelcomeBanner />
        </div>
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialSpaceOptions={initialSpaceOptions}
          memberSpaceIds={memberSpaceIds}
          initialTime="month"
          initialSort="best"
          showSortFilter
          showTypeFilter
          dividerBeforeFeed
          titleOpensSidePanel
          matchDebatePanelClaimCardsOnMobile
          feedTopSpacingClassName=""
        />
      </main>
    </EntityPageSidebarLayout>
  );
}
