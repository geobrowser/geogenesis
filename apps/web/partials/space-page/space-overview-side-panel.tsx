'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import type { CallSeries } from '~/core/community-calls/types';
import type { TopicUsage } from '~/core/io/subgraph/topic-space-usage';
import { useSpaceDailyActivityTasks } from '~/core/space/use-space-daily-activities';

import { SpaceCommunityCallsSection } from '~/partials/community-calls/space-community-calls-section';
import { type SideRailSection, SideRailSections } from '~/partials/entity-page/sticky-side-rail';

import { SpaceDailyActivitiesSection } from './space-daily-activities-section';
import { SubspacesSection } from './subspaces-section';
import { spaceSidebarHasContentAtom } from '~/atoms';

type Props = {
  spaceId: string;
  /** Daily activities are client-only (signed-in viewer); pass true on Overview only. */
  dailyActivities?: boolean;
  communityCalls?: CallSeries[];
  /** Overview only — the tab the subspaces gallery used to sit on top of (GEO-2875). */
  subspaces?: TopicUsage[];
};

/**
 * Non-root space rail: subspaces + daily activities (Overview) + community calls. Root and Explore
 * use {@link ExploreSidePanel} instead. Publishes content state to the layout header via
 * {@link spaceSidebarHasContentAtom}.
 */
export function SpaceOverviewSidePanel({ spaceId, dailyActivities = false, communityCalls, subspaces }: Props) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);

  // Built as a list so an absent section never leaves a dangling divider behind it — with three
  // optional sections the hand-written `a && b ? <hr/> : null` pairs stop being readable.
  const sections: SideRailSection[] = [];

  if (subspaces && subspaces.length > 0) {
    // First, because this is where the reader used to meet it: the gallery was the top of the page,
    // above the editor.
    sections.push({ key: 'subspaces', node: <SubspacesSection spaceId={spaceId} subspaces={subspaces} /> });
  }
  if (dailyActivities && tasks.length > 0) {
    sections.push({ key: 'daily-activities', node: <SpaceDailyActivitiesSection spaceId={spaceId} tasks={tasks} /> });
  }
  if (communityCalls && communityCalls.length > 0) {
    sections.push({
      key: 'community-calls',
      node: <SpaceCommunityCallsSection spaceId={spaceId} series={communityCalls} />,
    });
  }

  const hasContent = sections.length > 0;

  const setSidebarHasContent = useSetAtom(spaceSidebarHasContentAtom);
  React.useEffect(() => {
    setSidebarHasContent(hasContent);
    return () => setSidebarHasContent(null);
  }, [hasContent, setSidebarHasContent]);

  if (!hasContent) return null;

  return <SideRailSections sections={sections} />;
}
