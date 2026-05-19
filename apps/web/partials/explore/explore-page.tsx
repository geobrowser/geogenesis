'use client';

import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import type { RecentlyClaimedSpace } from '~/core/io/subgraph/fetch-recently-claimed-spaces';

import { EntityFeed, type SpaceOption } from '~/partials/feed/entity-feed';

import { ExploreSidePanel } from './explore-side-panel';

type Props = {
  initialSpaceOptions: SpaceOption[];
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  parentTopicOptions: ParentTopicOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

export function ExplorePage({
  initialSpaceOptions,
  unclaimedTopics,
  recentlyClaimedSpaces,
  parentTopicOptions,
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
        parentTopicOptions={parentTopicOptions}
        pendingMembershipSpaceIds={pendingMembershipSpaceIds}
        memberOrEditorSpaceIds={memberOrEditorSpaceIds}
      />
    </div>
  );
}
