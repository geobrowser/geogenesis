'use client';

import * as React from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';
import { useSpaceCalls } from '~/core/space-calls/hooks';
import { parseScheduledParams, seriesSynced } from '~/core/space-calls/series/after-publish';
import { rowReminders, splitCallList } from '~/core/space-calls/series/call-list';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Text } from '~/design-system/text';

import { CallRemind } from './call-remind';
import { CallRow, CallsSection } from './calls-list';
import { ScheduledNotice } from './scheduled-notice';

export const CALLS_TAB_COPY = {
  live: 'Live',
  upcoming: 'Upcoming',
  noLive: 'No call is live right now.',
  noUpcoming: 'No calls scheduled.',
  schedule: 'Schedule a call',
  unsupported: 'This space does not have calls.',
  loadFailed: 'Could not load calls.',
  off: 'Calls are not available yet.',
} as const;

/** The scheduling form, which writes the Community Call entity to the graph. */
export function scheduleCallHref(spaceId: string) {
  return `/space/${spaceId}/community/new`;
}

/** A space's Calls tab (GEO-3420): live and upcoming calls, and scheduling for editors. */
export function SpaceCallsTab({ spaceId }: { spaceId: string }) {
  const enabled = useFeatureFlag('callSeries');
  if (!enabled) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {CALLS_TAB_COPY.off}
      </Text>
    );
  }
  return <SpaceCallsTabInner spaceId={spaceId} />;
}

function SpaceCallsTabInner({ spaceId }: { spaceId: string }) {
  const callsQuery = useSpaceCalls(spaceId);
  const searchParams = useSearchParams();
  const scheduled = parseScheduledParams(searchParams);
  const data = callsQuery.data;

  const { live, upcoming } = splitCallList(data);
  // A publish waiting on governance keeps its note: nothing will list it until the proposal passes.
  const showScheduled = scheduled !== null && (scheduled.outcome !== 'executed' || !seriesSynced(data, scheduled));

  if (data?.supported === false) {
    return (
      <Text as="p" variant="metadata" color="grey-04">
        {CALLS_TAB_COPY.unsupported}
      </Text>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-8" data-testid="space-calls-tab">
      {data?.viewer_can_start ? (
        <div className="flex justify-end">
          <Link
            href={scheduleCallHref(spaceId)}
            className={hubPillClassName('primary')}
            data-geo-analytics-label="Calls tab schedule"
          >
            {CALLS_TAB_COPY.schedule}
          </Link>
        </div>
      ) : null}

      {showScheduled ? <ScheduledNotice spaceId={spaceId} outcome={scheduled.outcome} /> : null}

      {callsQuery.isError && !data ? (
        <Text as="p" variant="metadata" color="grey-04">
          {CALLS_TAB_COPY.loadFailed}
        </Text>
      ) : data ? (
        <>
          <CallsSection
            title={CALLS_TAB_COPY.live}
            empty={CALLS_TAB_COPY.noLive}
            count={live.length}
            testId="calls-tab-live"
          >
            {live.map(call => (
              <CallRow key={call.callId} spaceId={spaceId} call={call} />
            ))}
          </CallsSection>
          <CallsSection
            title={CALLS_TAB_COPY.upcoming}
            empty={CALLS_TAB_COPY.noUpcoming}
            count={upcoming.length}
            testId="calls-tab-upcoming"
          >
            {upcoming.map(call => {
              const reminded = rowReminders(data.viewer, call);
              return (
                <CallRow
                  key={call.callId}
                  spaceId={spaceId}
                  call={call}
                  action={
                    <CallRemind
                      spaceId={spaceId}
                      callId={call.callId}
                      seriesId={call.seriesId}
                      call={reminded.call}
                      series={reminded.series}
                      analyticsLabel="Calls tab remind"
                    />
                  }
                />
              );
            })}
          </CallsSection>
        </>
      ) : null}
    </div>
  );
}
