'use client';

import * as React from 'react';

import Link from 'next/link';

import { liveCallHref } from '~/core/community-calls/constants';
import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { bucketOccurrences, getOccurrences } from '~/core/community-calls/occurrences';
import { CallSeries, Occurrence } from '~/core/community-calls/types';
import { useAccessControl } from '~/core/hooks/use-access-control';

import { Button } from '~/design-system/button';

import { ExploreJoinSpaceButton } from '~/partials/explore/explore-join-space-button';

import { AddToCalendarMenu } from './add-to-calendar-menu';
import { ParticipantAvatarStrip } from './participant-avatar-strip';
import { RsvpButton } from './rsvp-button';

type Row = { call: CallSeries; occ: Occurrence };

/** Pick the live call if there is one, else the soonest upcoming, across all of a space's series. */
function pickHighlight(series: CallSeries[], now: number): { row: Row; isLive: boolean } | null {
  let live: Row | null = null;
  let upcoming: Row | null = null;
  for (const call of series) {
    const buckets = bucketOccurrences(getOccurrences(call.schedule, now), now);
    if (buckets.live && !live) live = { call, occ: buckets.live };
    for (const occ of buckets.upcoming) {
      if (!upcoming || occ.startMs < upcoming.occ.startMs) upcoming = { call, occ };
    }
  }
  if (live) return { row: live, isLive: true };
  if (upcoming) return { row: upcoming, isLive: false };
  return null;
}

/**
 * Condensed Community calls digest for a space home page. Shows a single
 * highlight (the live call, else the next upcoming) with a "View all" link to
 * the space's Community tab. Hidden only when the space has no call series at
 * all — with no live/upcoming occurrence, the rail still renders so "View all"
 * stays reachable.
 */
export function SpaceCommunityCallsSection({ spaceId, series }: { spaceId: string; series: CallSeries[] }) {
  // Bucket after mount so SSR/CSR clock splits can't diverge (hydration-safe), then
  // keep refreshing so a call transitions live/upcoming while the page stays open.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const { isMember, isEditor, isLoading: accessLoading } = useAccessControl(spaceId);

  const highlight = React.useMemo(() => {
    if (now === null) return null;
    return pickHighlight(series, now);
  }, [series, now]);

  if (series.length === 0) return null;

  return (
    <aside className="ml-8 w-[300px] shrink-0 border-l border-divider pl-8 lg:hidden">
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">Community calls</h2>
          <Link href={`/space/${spaceId}/community`} className="shrink-0 text-[16px] leading-[20px] text-ctaPrimary">
            View all
          </Link>
        </div>
        <p className="text-[16px] leading-[20px] text-grey-04">
          The heartbeat of the community. See what people are doing and find a way to get involved.
        </p>
      </div>

      {now === null ? null : highlight === null ? (
        <p className="text-[16px] leading-[20px] text-grey-04">No live or upcoming calls.</p>
      ) : highlight.isLive ? (
        <LiveCard spaceId={spaceId} row={highlight.row} />
      ) : (
        <UpcomingCard row={highlight.row} isMember={isMember} isEditor={isEditor} accessLoading={accessLoading} />
      )}
    </aside>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-grey-02 p-5">{children}</div>;
}

function Title({ row }: { row: Row }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[16px] leading-[20px] font-medium text-text">{row.call.name}</span>
      <span className="text-[16px] leading-[20px] text-grey-04">{formatTimeRange(row.occ.startMs, row.occ.endMs)}</span>
    </div>
  );
}

function LiveCard({ spaceId, row }: { spaceId: string; row: Row }) {
  return (
    <CardShell>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[16px] leading-[20px] font-medium text-red-01">
          <span className="size-2 animate-pulse rounded-full bg-red-01" />
          LIVE
        </span>
        <Link href={liveCallHref(spaceId, row.call.callId)}>
          <Button variant="primary">Join call</Button>
        </Link>
      </div>
      <Title row={row} />
      <ParticipantAvatarStrip spaceId={spaceId} callId={row.call.callId} occurrenceStart={row.occ.startMs} />
    </CardShell>
  );
}

function UpcomingCard({
  row,
  isMember,
  isEditor,
  accessLoading,
}: {
  row: Row;
  isMember: boolean;
  isEditor: boolean;
  accessLoading: boolean;
}) {
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-2">
        <Title row={row} />
        <CardAction call={row.call} isMember={isMember} isEditor={isEditor} accessLoading={accessLoading} />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[16px] leading-[20px] text-grey-04">{formatDateLabel(row.occ.startMs)}</span>
        <AddToCalendarMenu
          spaceId={row.call.spaceId}
          callId={row.call.callId}
          name={row.call.name}
          startMs={row.occ.startMs}
          endMs={row.occ.endMs}
          schedule={row.call.schedule}
        />
      </div>
    </CardShell>
  );
}

/**
 * Mirrors explore-community-calls-section's upcoming-card treatment: editors get
 * an RSVP button (curator's `isCreator`/`isEditor` gate on "RSVP via email" —
 * regular members never see it), everyone else gets "Join space" — we don't have a
 * server-computed "request already pending" signal for a single space page, so
 * ExploreJoinSpaceButton's own post-click optimistic state covers that instead.
 */
function CardAction({
  call,
  isMember,
  isEditor,
  accessLoading,
}: {
  call: CallSeries;
  isMember: boolean;
  isEditor: boolean;
  accessLoading: boolean;
}) {
  if (accessLoading) return null;
  if (isEditor) return <RsvpButton call={call} />;
  if (isMember) return null;
  return (
    <div className="shrink-0 whitespace-nowrap">
      <ExploreJoinSpaceButton spaceId={call.spaceId} hasRequestedSpaceMembership={false} variant="text" />
    </div>
  );
}
