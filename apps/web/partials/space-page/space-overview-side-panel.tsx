'use client';

import * as React from 'react';

import type { CallSeries } from '~/core/community-calls/types';
import { DailyActivityCompletionProbes, useDailyActivityCompletion } from '~/core/space/use-daily-activity-completion';
import { useSpaceDailyActivityTasks } from '~/core/space/use-space-daily-activities';

import { SpaceCommunityCallsSection } from '~/partials/community-calls/space-community-calls-section';

import { SpaceDailyActivitiesSection } from './space-daily-activities-section';

type Props = {
  spaceId: string;
  communityCalls: CallSeries[];
};

/**
 * Daily activities (when the viewer is signed in and has tasks left to do) first, then the
 * community-calls digest. Hidden entirely when neither has content.
 */
export function SpaceOverviewSidePanel({ spaceId, communityCalls }: Props) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);
  const { completionById, onCompleteChange, allComplete, isLoading } = useDailyActivityCompletion(spaceId, tasks);

  // A finished checklist is just a list of ticks, so it gives the space back rather than sitting
  // there. Tomorrow's reset brings it back — see the probes below for why they outlive it.
  const showDaily = tasks.length > 0 && !allComplete;
  const showCalls = communityCalls.length > 0;

  return (
    <>
      {/* Draws nothing, and deliberately mounted whether or not the checklist is. These are what
          watch each task, so unmounting them with the checklist would leave nothing to notice the
          daily reset — it would stay hidden for the rest of the session. The space header sizes
          itself on the same completion, so it has to be watched from here regardless. */}
      <DailyActivityCompletionProbes tasks={tasks} spaceId={spaceId} onCompleteChange={onCompleteChange} />

      {showDaily || showCalls ? (
        <aside className="ml-8 w-[300px] shrink-0 border-l border-divider pl-8 lg:hidden">
          <div className="flex flex-col gap-6 pb-4">
            {showDaily ? (
              <SpaceDailyActivitiesSection tasks={tasks} completionById={completionById} isLoading={isLoading} />
            ) : null}
            {showCalls ? <SpaceCommunityCallsSection spaceId={spaceId} series={communityCalls} /> : null}
          </div>
        </aside>
      ) : null}
    </>
  );
}
