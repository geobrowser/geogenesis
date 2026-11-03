'use client';

import * as React from 'react';

import Link from 'next/link';

import type { ScheduleOutcome } from '~/core/space-calls/series/schedule-outcome';

import { Text } from '~/design-system/text';

export const SCHEDULED_NOTICE_COPY = {
  executed: 'Saved. Upcoming calls will update here shortly.',
  pending: 'Your call is waiting on governance. It will appear here once the proposal passes.',
  unknown: 'Call submitted. If it does not appear here shortly, check Governance.',
  governance: 'Open Governance',
} as const;

/**
 * Said on the Calls tab after a schedule publish (GEO-3420), until geo-chat lists the series.
 * A proposal still waiting on governance is never drawn as scheduled.
 */
export function ScheduledNotice({ spaceId, outcome }: { spaceId: string; outcome: ScheduleOutcome }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-grey-01 px-4 py-3"
      data-testid="calls-tab-scheduled-notice"
      data-outcome={outcome}
    >
      <Text as="p" variant="metadata">
        {SCHEDULED_NOTICE_COPY[outcome]}
      </Text>
      {outcome === 'executed' ? null : (
        <Link href={`/space/${spaceId}/governance`} className="text-metadata text-ctaPrimary hover:underline">
          {SCHEDULED_NOTICE_COPY.governance}
        </Link>
      )}
    </div>
  );
}
