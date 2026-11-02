'use client';

import * as React from 'react';

import Link from 'next/link';

import type { SpaceCallsResponse } from '~/core/space-calls/api';
import { spaceCallsTabPath } from '~/core/space-calls/routes';
import { rowReminders, splitCallList } from '~/core/space-calls/series/call-list';

import { Text } from '~/design-system/text';

import { CallRemind } from './call-remind';
import { CallRow } from './calls-list';

/** Whether the rail has a call to show: one live or scheduled. */
export function hasRailCall(list: SpaceCallsResponse | undefined) {
  const { live, upcoming } = splitCallList(list);
  return live.length + upcoming.length > 0;
}

/**
 * The space rail's calls (GEO-3420, `spaceCalls`): the live call, else the next scheduled one, and a
 * link to the Calls tab. Stands in for the curator-era section while the flag is on.
 */
export function SpaceCallsRailSection({ spaceId, list }: { spaceId: string; list: SpaceCallsResponse }) {
  const { live, upcoming } = splitCallList(list);
  const call = live[0] ?? upcoming[0];
  if (!call) return null;
  const reminded = rowReminders(list.viewer, call);

  return (
    <div className="flex flex-col gap-3" data-testid="space-calls-rail">
      <div className="flex items-center justify-between">
        <Text as="h2" variant="smallTitle">
          Calls
        </Text>
        <Link href={spaceCallsTabPath(spaceId)} className="shrink-0 text-metadata text-ctaPrimary">
          View all
        </Link>
      </div>
      <ul>
        <CallRow
          spaceId={spaceId}
          call={call}
          action={
            <CallRemind
              spaceId={spaceId}
              callId={call.callId}
              seriesId={call.remindSeriesId}
              call={reminded.call}
              series={reminded.series}
              analyticsLabel="Space rail remind"
            />
          }
        />
      </ul>
    </div>
  );
}
