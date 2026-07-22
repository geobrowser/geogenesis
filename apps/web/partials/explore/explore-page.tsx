'use client';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';
import { OverviewWithSideRailLayout } from '~/partials/side-panel/overview-side-rail';

import { ExploreSidePanel } from './explore-side-panel';
import { ExploreWelcomeBanner } from './explore-welcome-banner';

type Props = {
  initialSpaceOptions: SpaceOption[];
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  editorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

export function ExplorePage({
  initialSpaceOptions,
  featuredSpaces,
  featuredRankings,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
  editorSpaceIds,
  communityCalls,
}: Props) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-6 lg:px-4">
      <OverviewWithSideRailLayout
        variant="explore"
        main={
          <main className="min-w-0">
            <div className="mx-auto w-full max-w-[880px]">
              <ExploreWelcomeBanner />
            </div>
            <EntityFeed
              apiEndpoint="/api/explore/feed"
              initialSpaceOptions={initialSpaceOptions}
              initialTime="month"
              initialSort="top"
              showSortFilter
              dividerBeforeFeed
              feedTopSpacingClassName=""
            />
          </main>
        }
        rail={
          <ExploreSidePanel
            featuredSpaces={featuredSpaces}
            featuredRankings={featuredRankings}
            pendingMembershipSpaceIds={pendingMembershipSpaceIds}
            memberOrEditorSpaceIds={memberOrEditorSpaceIds}
            editorSpaceIds={editorSpaceIds}
            communityCalls={communityCalls}
          />
        }
      />
    </div>
  );
}
