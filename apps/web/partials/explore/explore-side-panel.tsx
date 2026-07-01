'use client';

import { useCuratorOnboardingStatus } from '~/core/hooks/use-curator-onboarding-status';
import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import type { RecentlyClaimedSpace } from '~/core/io/subgraph/fetch-recently-claimed-spaces';
import { normId } from '~/core/utils/norm-id';

import { ClaimATopicSection } from './claim-a-topic-section';
import { CuratorOnboardingSection } from './curator-onboarding-section';
import { RecentlyClaimedSection } from './recently-claimed-section';

export type ExploreSidePanelProps = {
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  parentTopicOptions: ParentTopicOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

export function ExploreSidePanel({
  unclaimedTopics,
  recentlyClaimedSpaces,
  parentTopicOptions,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
}: ExploreSidePanelProps) {
  const { isVisible: showOnboarding } = useCuratorOnboardingStatus();
  const pendingSet = new Set(pendingMembershipSpaceIds.map(normId));
  const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
  const hasTopicSections = unclaimedTopics.length > 0 || recentlyClaimedSpaces.length > 0;

  if (!showOnboarding && !hasTopicSections) return null;

  return (
    // Independent scroll surface mirroring BrowseSidebar pattern
    // (partials/browse-sidebar/browse-sidebar.tsx:323,339). The aside pins to
    // top: 44px (navbar height) so its full height is always visible — without
    // the offset, the panel's bottom sits below the viewport at top-of-page
    // and Recently Claimed becomes unreachable without scrolling the main feed.
    // `self-start` stops the flex container from stretching the aside past its
    // declared height.
    <aside className="sticky top-11 flex h-[calc(100dvh-2.75rem)] w-[360px] shrink-0 flex-col self-start lg:hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col pt-5 pb-6">
          <CuratorOnboardingSection />
          {showOnboarding && hasTopicSections ? <hr className="my-6 border-t border-divider" /> : null}
          {hasTopicSections ? (
            <>
              <ClaimATopicSection topics={unclaimedTopics} parentTopicOptions={parentTopicOptions} />
              {recentlyClaimedSpaces.length > 0 ? (
                <>
                  <hr className="my-6 border-t border-divider" />
                  <RecentlyClaimedSection
                    spaces={recentlyClaimedSpaces}
                    pendingMembershipSpaceIds={pendingSet}
                    memberOrEditorSpaceIds={memberOrEditorSet}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
