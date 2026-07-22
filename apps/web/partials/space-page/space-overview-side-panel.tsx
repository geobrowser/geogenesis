'use client';

import * as React from 'react';

import type { CallSeries } from '~/core/community-calls/types';
import { useSpaceDailyActivityTasks } from '~/core/space/use-space-daily-activities';

import { SpaceCommunityCallsSection } from '~/partials/community-calls/space-community-calls-section';

import { SpaceDailyActivitiesSection } from './space-daily-activities-section';

type Props = {
  spaceId: string;
  communityCalls: CallSeries[];
};

/**
 * Daily activities (when the viewer is signed in and tasks exist) first,
 * then the community-calls digest. Hidden entirely when neither has content.
 */
export function SpaceOverviewSidePanel({ spaceId, communityCalls }: Props) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);
  const showDaily = tasks.length > 0;
  const showCalls = communityCalls.length > 0;

  if (!showDaily && !showCalls) return null;

  return (
    <aside className="ml-8 w-[300px] shrink-0 border-l border-divider pl-8 lg:hidden">
      <div className="flex flex-col gap-6 pb-4">
        {showDaily ? <SpaceDailyActivitiesSection spaceId={spaceId} /> : null}
        {showCalls ? <SpaceCommunityCallsSection spaceId={spaceId} series={communityCalls} embedded /> : null}
      </div>
    </aside>
  );
}
