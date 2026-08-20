'use client';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';

import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

import { ExploreSidePanel } from './explore-side-panel';
import { ExploreWelcomeBanner } from './explore-welcome-banner';

type Props = {
  initialSpaceOptions: SpaceOption[];
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

export function ExplorePage({
  initialSpaceOptions,
  featuredSpaces,
  featuredRankings,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
  communityCalls,
}: Props) {
  return (
    <EntityPageSidebarLayout
      sidebar={
        <ExploreSidePanel
          featuredSpaces={featuredSpaces}
          featuredRankings={featuredRankings}
          pendingMembershipSpaceIds={pendingMembershipSpaceIds}
          memberOrEditorSpaceIds={memberOrEditorSpaceIds}
          communityCalls={communityCalls}
        />
      }
    >
      <main className="min-w-0 pt-5">
        <div className="mx-auto w-full max-w-[880px]">
          <ExploreWelcomeBanner />
        </div>
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialSpaceOptions={initialSpaceOptions}
          initialTime="month"
          initialSort="best"
          showSortFilter
          showTypeFilter
          dividerBeforeFeed
          feedTopSpacingClassName=""
        />
      </main>
    </EntityPageSidebarLayout>
  );
}
