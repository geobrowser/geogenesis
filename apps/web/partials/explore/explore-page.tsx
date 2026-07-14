'use client';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

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
    <div className="mx-auto flex w-full max-w-[1320px] gap-8 px-6 lg:px-4">
      <main className="min-w-0 flex-1 pt-5">
        <div className="mx-auto w-full max-w-[880px]">
          <ExploreWelcomeBanner />
        </div>
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialSpaceOptions={initialSpaceOptions}
          initialTime="month"
          showSortFilter
          dividerBeforeFeed
          feedTopSpacingClassName=""
        />
      </main>
      <div aria-hidden className="w-px shrink-0 self-stretch bg-divider lg:hidden" />
      <ExploreSidePanel
        featuredSpaces={featuredSpaces}
        featuredRankings={featuredRankings}
        pendingMembershipSpaceIds={pendingMembershipSpaceIds}
        memberOrEditorSpaceIds={memberOrEditorSpaceIds}
        editorSpaceIds={editorSpaceIds}
        communityCalls={communityCalls}
      />
    </div>
  );
}
