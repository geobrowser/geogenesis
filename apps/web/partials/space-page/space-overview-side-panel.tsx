'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';

import type { CallSeries } from '~/core/community-calls/types';
import { useSpaceDailyActivityTasks } from '~/core/space/use-space-daily-activities';

import { SpaceCommunityCallsSection } from '~/partials/community-calls/space-community-calls-section';
import { StickySideRail } from '~/partials/entity-page/sticky-side-rail';

import { SpaceDailyActivitiesSection } from './space-daily-activities-section';
import { spaceSidebarHasContentAtom } from '~/atoms';

type Props = {
  spaceId: string;
  /** Daily activities are client-only (signed-in viewer); pass true on Overview only. */
  dailyActivities?: boolean;
  communityCalls?: CallSeries[];
};

/**
 * Non-root space rail: daily activities (Overview) + community calls. Root and Explore
 * use {@link ExploreSidePanel} instead. Publishes content state to the layout header via
 * {@link spaceSidebarHasContentAtom}.
 */
export function SpaceOverviewSidePanel({ spaceId, dailyActivities = false, communityCalls }: Props) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);

  const showDaily = dailyActivities && tasks.length > 0;
  const showCalls = !!communityCalls && communityCalls.length > 0;
  const hasContent = showDaily || showCalls;

  const setSidebarHasContent = useSetAtom(spaceSidebarHasContentAtom);
  React.useEffect(() => {
    setSidebarHasContent(hasContent);
    return () => setSidebarHasContent(null);
  }, [hasContent, setSidebarHasContent]);

  if (!hasContent) return null;

  return (
    <StickySideRail>
      {showDaily ? <SpaceDailyActivitiesSection spaceId={spaceId} tasks={tasks} /> : null}
      {showDaily && showCalls ? <hr className="my-6 border-t border-divider" /> : null}
      {showCalls ? <SpaceCommunityCallsSection spaceId={spaceId} series={communityCalls} /> : null}
    </StickySideRail>
  );
}
