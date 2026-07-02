'use client';

import * as React from 'react';

import { usePendingMembershipSet } from '~/core/hooks/use-pending-memberships';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import type { RootTopicChip } from '~/core/io/subgraph/fetch-first-level-subtopics';
import type { ParentTopicOption } from '~/core/io/subgraph/fetch-parent-topic-options';
import type { RecentlyClaimedSpace } from '~/core/io/subgraph/fetch-recently-claimed-spaces';
import { normId } from '~/core/utils/norm-id';

import { ClaimATopicSection } from './claim-a-topic-section';
import { JoinSpacesSection } from './join-spaces-section';
import { RecentlyClaimedSection } from './recently-claimed-section';

export type ExploreSidePanelProps = {
  featuredSpaces: FeaturedSpace[];
  unclaimedTopics: RootTopicChip[];
  recentlyClaimedSpaces: RecentlyClaimedSpace[];
  parentTopicOptions: ParentTopicOption[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
};

export function ExploreSidePanel({
  featuredSpaces,
  unclaimedTopics,
  recentlyClaimedSpaces,
  parentTopicOptions,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
}: ExploreSidePanelProps) {
  // Durable (server) + optimistic (persisted) pending requests, unioned with the
  // SSR-seeded set for first paint.
  const dynamicPendingSet = usePendingMembershipSet();

  const pendingSet = new Set(pendingMembershipSpaceIds.map(normId));
  const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));

  // A space drops out of "Join spaces" once the user belongs to it, already has
  // a pending request from a prior visit, or just requested one this session.
  const joinableSpaces = featuredSpaces.filter(space => {
    const normalized = normId(space.spaceId);
    return !memberOrEditorSet.has(normalized) && !pendingSet.has(normalized) && !dynamicPendingSet.has(normalized);
  });

  const hasContent = joinableSpaces.length > 0 || unclaimedTopics.length > 0 || recentlyClaimedSpaces.length > 0;
  if (!hasContent) return null;

  // Build only the sections that have content, then join them with dividers so
  // an empty section never leaves a dangling <hr> (e.g. join-spaces-only). Each
  // carries a stable key so appearing/disappearing sections don't remount others.
  const sections: { key: string; node: React.ReactNode }[] = [];
  if (joinableSpaces.length > 0) {
    sections.push({ key: 'join-spaces', node: <JoinSpacesSection spaces={joinableSpaces} /> });
  }
  if (unclaimedTopics.length > 0 || parentTopicOptions.length > 0) {
    sections.push({
      key: 'claim',
      node: <ClaimATopicSection topics={unclaimedTopics} parentTopicOptions={parentTopicOptions} />,
    });
  }
  if (recentlyClaimedSpaces.length > 0) {
    sections.push({
      key: 'recently-claimed',
      node: (
        <RecentlyClaimedSection
          spaces={recentlyClaimedSpaces}
          pendingMembershipSpaceIds={pendingSet}
          memberOrEditorSpaceIds={memberOrEditorSet}
        />
      ),
    });
  }

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
          {sections.map((section, index) => (
            <React.Fragment key={section.key}>
              {index > 0 ? <hr className="my-6 border-t border-divider" /> : null}
              {section.node}
            </React.Fragment>
          ))}
        </div>
      </div>
    </aside>
  );
}
