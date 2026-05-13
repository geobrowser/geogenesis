'use client';

import type { RecentlyClaimedSpace, RootTopicChip } from '~/core/io/subgraph/fetch-root-topics';
import type { TopicSpaceOption } from '~/core/io/subgraph/fetch-topic-space-options';

import { ClaimATopicSection } from './claim-a-topic-section';
import { RecentlyClaimedSection } from './recently-claimed-section';

export type ExploreSidePanelProps = {
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  topicSpaceOptions: TopicSpaceOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

function normId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

export function ExploreSidePanel({
  unclaimedTopics,
  recentlyClaimedSpaces,
  topicSpaceOptions,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
}: ExploreSidePanelProps) {
  const hasContent = unclaimedTopics.length > 0 || recentlyClaimedSpaces.length > 0;
  if (!hasContent) return null;

  const pendingSet = new Set(pendingMembershipSpaceIds.map(normId));
  const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));

  return (
    // Independent scroll surface mirroring BrowseSidebar pattern
    // (partials/browse-sidebar/browse-sidebar.tsx:323,339). The aside pins to
    // top: 44px (navbar height) so its full height is always visible — without
    // the offset, the panel's bottom sits below the viewport at top-of-page
    // and Recently Claimed becomes unreachable without scrolling the main feed.
    // `self-start` stops the flex container from stretching the aside past its
    // declared height.
    <aside className="sticky top-11 flex h-[calc(100dvh-4.75rem)] w-[360px] shrink-0 flex-col self-start lg:hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-8 pb-6">
          <ClaimATopicSection topics={unclaimedTopics} spaceOptions={topicSpaceOptions} />
          <RecentlyClaimedSection
            spaces={recentlyClaimedSpaces}
            pendingMembershipSpaceIds={pendingSet}
            memberOrEditorSpaceIds={memberOrEditorSet}
          />
        </div>
      </div>
    </aside>
  );
}
