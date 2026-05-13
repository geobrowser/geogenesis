'use client';

import type { RecentlyClaimedSpace, RootTopicChip } from '~/core/io/subgraph/fetch-root-topics';
import type { TopicSpaceOption } from '~/core/io/subgraph/fetch-topic-space-options';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

import { ExploreSidePanel } from './explore-side-panel';

type Props = {
  initialSpaceOptions: SpaceOption[];
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  topicSpaceOptions: TopicSpaceOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

export function ExplorePage({
  initialSpaceOptions,
  unclaimedTopics,
  recentlyClaimedSpaces,
  topicSpaceOptions,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
}: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[1320px] gap-10 px-6 lg:px-4">
      <main className="min-w-0 flex-1">
        <EntityFeed
          apiEndpoint="/api/explore/feed"
          initialSpaceOptions={initialSpaceOptions}
          initialTime="month"
          showSortFilter
        />
      </main>
      <ExploreSidePanel
        unclaimedTopics={unclaimedTopics}
        recentlyClaimedSpaces={recentlyClaimedSpaces}
        topicSpaceOptions={topicSpaceOptions}
        pendingMembershipSpaceIds={pendingMembershipSpaceIds}
        memberOrEditorSpaceIds={memberOrEditorSpaceIds}
      />
    </div>
  );
}
