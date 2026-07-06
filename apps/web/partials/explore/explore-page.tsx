'use client';

import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import type { RecentlyClaimedSpace } from '~/core/io/subgraph/fetch-recently-claimed-spaces';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

import { ExploreSidePanel } from './explore-side-panel';

type Props = {
  initialSpaceOptions: SpaceOption[];
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  parentTopicOptions: ParentTopicOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

export function ExplorePage({
  initialSpaceOptions,
  featuredSpaces,
  featuredRankings,
  unclaimedTopics,
  recentlyClaimedSpaces,
  parentTopicOptions,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] gap-8 px-6 lg:px-4">
      <main className="min-w-0 flex-1 pt-5">
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialSpaceOptions={initialSpaceOptions}
          initialTime="month"
          showSortFilter
          dividerBeforeFeed
          feedTopSpacingClassName=""
        />
      </main>
      <div
        aria-hidden
        className="sticky top-11 h-[calc(100dvh-2.75rem)] w-px shrink-0 self-start bg-divider lg:hidden"
      />
      <ExploreSidePanel
        featuredSpaces={featuredSpaces}
        featuredRankings={featuredRankings}
        unclaimedTopics={unclaimedTopics}
        recentlyClaimedSpaces={recentlyClaimedSpaces}
        parentTopicOptions={parentTopicOptions}
        pendingMembershipSpaceIds={pendingMembershipSpaceIds}
        memberOrEditorSpaceIds={memberOrEditorSpaceIds}
      />
    </div>
  );
}
