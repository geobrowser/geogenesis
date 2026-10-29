'use client';

import * as React from 'react';

import Link from 'next/link';

import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { pastCallDurationLabel } from '~/core/space-calls/recording/past-call-card';
import { spaceCallPath } from '~/core/space-calls/routes';
import { callDateLabel, callTimeLabel } from '~/core/space-calls/series/format';
import { useSpacePastCalls } from '~/core/space-calls/series/past-calls';

import { Text } from '~/design-system/text';

import { CallsSection } from './calls-list';

export const PAST_CALLS_COPY = {
  title: 'Past',
  empty: 'No past calls yet.',
  failed: 'Could not load past calls.',
  more: 'Show more',
  loading: 'Loading…',
  recording: 'Recording',
} as const;

/** A space's ended calls, newest first, recorded or not (GEO-3420). */
export function PastCallsSection({ spaceId }: { spaceId: string }) {
  const past = useSpacePastCalls(spaceId);
  const calls = past.data?.pages.flatMap(page => page.calls) ?? [];

  if (past.isError && calls.length === 0) {
    return (
      <CallsSection title={PAST_CALLS_COPY.title} empty={PAST_CALLS_COPY.failed} count={0} testId="calls-tab-past">
        {null}
      </CallsSection>
    );
  }
  if (!past.data) return null;

  return (
    <div className="flex flex-col gap-3">
      <CallsSection
        title={PAST_CALLS_COPY.title}
        empty={PAST_CALLS_COPY.empty}
        count={calls.length}
        testId="calls-tab-past"
      >
        {calls.map(call => {
          const when = [callDateLabel(call.starts_at), callTimeLabel(call.starts_at, null)].filter(Boolean).join(' · ');
          const length = pastCallDurationLabel(call.duration_seconds);
          // As on upcoming rows: the series, when it names the call differently.
          const series = call.series?.name && call.series.name !== call.name ? call.series.name : null;
          return (
            <li
              key={call.call_id}
              className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white p-3"
              data-testid="calls-tab-past-row"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Text as="span" variant="footnoteMedium" color="grey-04">
                  {[when, length].filter(Boolean).join(' · ')}
                </Text>
                <Link href={spaceCallPath(spaceId, call.call_id)} className="min-w-0 hover:underline">
                  <Text as="span" variant="metadataMedium" className="block truncate">
                    {call.name}
                  </Text>
                </Link>
                {series ? (
                  <Text as="span" variant="footnote" color="grey-04" className="truncate">
                    {series}
                  </Text>
                ) : null}
              </div>
              {call.recording ? (
                <span className="shrink-0 rounded bg-grey-01 px-2 py-1 text-footnote text-grey-04">
                  {PAST_CALLS_COPY.recording}
                </span>
              ) : null}
            </li>
          );
        })}
      </CallsSection>
      {past.hasNextPage ? (
        <div className="flex justify-center">
          <HubPillButton
            analyticsLabel="Calls tab past more"
            pending={past.isFetchingNextPage}
            pendingLabel={PAST_CALLS_COPY.loading}
            onClick={() => void past.fetchNextPage()}
          >
            {PAST_CALLS_COPY.more}
          </HubPillButton>
        </div>
      ) : null}
    </div>
  );
}
