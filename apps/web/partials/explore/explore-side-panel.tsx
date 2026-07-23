'use client';

import * as React from 'react';

import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import { useCuratorOnboardingStatus } from '~/core/hooks/use-curator-onboarding-status';
import { usePendingMembershipSet } from '~/core/hooks/use-pending-memberships';
import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';
import type { FeaturedSpace } from '~/core/io/subgraph/fetch-featured-spaces';
import { normId } from '~/core/utils/norm-id';

import { ExploreCommunityCallsSection } from '~/partials/community-calls/explore-community-calls-section';
import { OverviewSideRail, OverviewSideRailSections } from '~/partials/side-panel/overview-side-rail';

import { CuratorOnboardingSection } from './curator-onboarding-section';
import { FeaturedRankingsSection } from './featured-rankings-section';
import { JoinSpacesSection } from './join-spaces-section';

export type ExploreSidePanelProps = {
  featuredSpaces: FeaturedSpace[];
  featuredRankings: FeaturedRanking[];
  pendingMembershipSpaceIds: string[];
  memberOrEditorSpaceIds: string[];
  editorSpaceIds: string[];
  communityCalls: ExploreCall[];
};

export function ExploreSidePanel({
  featuredSpaces,
  featuredRankings,
  pendingMembershipSpaceIds,
  memberOrEditorSpaceIds,
  editorSpaceIds,
  communityCalls,
}: ExploreSidePanelProps) {
  // Durable (server) + optimistic (persisted) pending requests, unioned with the
  // SSR-seeded set for first paint.
  const dynamicPendingSet = usePendingMembershipSet();
  const { isVisible: showOnboarding } = useCuratorOnboardingStatus();

  const pendingSet = new Set(pendingMembershipSpaceIds.map(normId));
  const memberOrEditorSet = new Set(memberOrEditorSpaceIds.map(normId));
  const editorSet = new Set(editorSpaceIds.map(normId));

  // A space drops out of "Join spaces" once the user belongs to it, already has
  // a pending request from a prior visit, or just requested one this session.
  const joinableSpaces = featuredSpaces.filter(space => {
    const normalized = normId(space.spaceId);
    return !memberOrEditorSet.has(normalized) && !pendingSet.has(normalized) && !dynamicPendingSet.has(normalized);
  });

  const hasContent =
    showOnboarding || joinableSpaces.length > 0 || featuredRankings.length > 0 || communityCalls.length > 0;
  if (!hasContent) return null;

  // Build only the sections that have content, then join them with dividers so
  // an empty section never leaves a dangling <hr> (e.g. join-spaces-only). Each
  // carries a stable key so appearing/disappearing sections don't remount others.
  const sections: { key: string; node: React.ReactNode }[] = [];
  if (showOnboarding) {
    sections.push({ key: 'curator-onboarding', node: <CuratorOnboardingSection /> });
  }
  if (joinableSpaces.length > 0) {
    sections.push({ key: 'join-spaces', node: <JoinSpacesSection spaces={joinableSpaces} /> });
  }
  if (featuredRankings.length > 0) {
    sections.push({ key: 'featured-rankings', node: <FeaturedRankingsSection rankings={featuredRankings} /> });
  }
  if (communityCalls.length > 0) {
    sections.push({
      key: 'community-calls',
      node: (
        <ExploreCommunityCallsSection
          calls={communityCalls}
          memberOrEditorSpaceIds={memberOrEditorSet}
          editorSpaceIds={editorSet}
          pendingMembershipSpaceIds={pendingSet}
        />
      ),
    });
  }

  return (
    <OverviewSideRail>
      <OverviewSideRailSections sections={sections} />
    </OverviewSideRail>
  );
}
