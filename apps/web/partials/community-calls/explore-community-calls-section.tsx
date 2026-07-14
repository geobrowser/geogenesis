'use client';

import * as React from 'react';

import Link from 'next/link';

import { liveCallHref } from '~/core/community-calls/constants';
import type { ExploreCall } from '~/core/community-calls/fetch-community-calls';
import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { bucketOccurrences, getOccurrences } from '~/core/community-calls/occurrences';
import { Occurrence } from '~/core/community-calls/types';
import { normId } from '~/core/utils/norm-id';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { Select } from '~/design-system/select';

import { ExploreJoinSpaceButton } from '~/partials/explore/explore-join-space-button';

import { AddToCalendarMenu } from './add-to-calendar-menu';
import { ParticipantAvatarStrip } from './participant-avatar-strip';
import { RsvpButton } from './rsvp-button';

type Row = { call: ExploreCall; occ: Occurrence };

// A recurring call expands into an occurrence per week across the whole future
// window, so the upcoming list runs long without a cap.
const INITIAL_VISIBLE_COUNT = 3;

type Props = {
  calls: ExploreCall[];
  /** Spaces the viewer already belongs to — no Join space button for these. */
  memberOrEditorSpaceIds: Set<string>;
  /** Spaces the viewer is an editor of — gates the RSVP button (curator's
   *  `isCreator`/editor-only gate on "RSVP via email"). */
  editorSpaceIds: Set<string>;
  /** Spaces with an in-flight membership request — render "Membership pending". */
  pendingMembershipSpaceIds: Set<string>;
};

/** Condensed cross-space digest of live + upcoming calls in the explore side panel. */
export function ExploreCommunityCallsSection({
  calls,
  memberOrEditorSpaceIds,
  editorSpaceIds,
  pendingMembershipSpaceIds,
}: Props) {
  // Bucket after mount so SSR/CSR time splits can't diverge (hydration-safe), then
  // keep refreshing so the LIVE badge and ordering stay correct while the panel is open.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [spaceFilter, setSpaceFilter] = React.useState('all');
  const [showAll, setShowAll] = React.useState(false);

  // A new filter is a new list, so collapse back to the default cap.
  const selectSpace = (value: string) => {
    setSpaceFilter(value);
    setShowAll(false);
  };

  const spaceOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of calls) if (!seen.has(c.spaceId)) seen.set(c.spaceId, c.spaceName);
    return [{ value: 'all', label: 'All spaces' }, ...[...seen].map(([value, label]) => ({ value, label }))];
  }, [calls]);

  const { live, upcoming } = React.useMemo(() => {
    if (now === null) return { live: [] as Row[], upcoming: [] as Row[] };
    const filtered = spaceFilter === 'all' ? calls : calls.filter(c => c.spaceId === spaceFilter);
    const live: Row[] = [];
    const upcoming: Row[] = [];
    for (const call of filtered) {
      const buckets = bucketOccurrences(getOccurrences(call.schedule, now), now);
      if (buckets.live) live.push({ call, occ: buckets.live });
      for (const occ of buckets.upcoming) upcoming.push({ call, occ });
    }
    upcoming.sort((a, b) => a.occ.startMs - b.occ.startMs);
    return { live, upcoming };
  }, [calls, spaceFilter, now]);

  if (calls.length === 0) return null;

  // The viewer can't participate in a call whose space they don't belong to, so
  // each card offers Join space when they're not already a member/editor.
  const membership = (spaceId: string) => ({
    isMember: memberOrEditorSpaceIds.has(normId(spaceId)),
    isEditor: editorSpaceIds.has(normId(spaceId)),
    pending: pendingMembershipSpaceIds.has(normId(spaceId)),
  });

  // Live calls are happening now, so the cap applies only to the upcoming stream.
  const visibleUpcoming = showAll ? upcoming : upcoming.slice(0, INITIAL_VISIBLE_COUNT);
  const hasMore = upcoming.length > INITIAL_VISIBLE_COUNT;

  return (
    <section className="flex flex-col">
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] leading-[23px] font-semibold tracking-[-0.02em] text-text">Community calls</h2>
          <div className="w-[120px]">
            <Select value={spaceFilter} onChange={selectSpace} options={spaceOptions} />
          </div>
        </div>
        <p className="text-[16px] leading-[20px] text-grey-04">
          The heartbeat of the community. See what people are doing and find a way to get involved.
        </p>
      </div>

      {now !== null && (
        <>
          <div className="flex flex-col gap-2">
            {live.map(row => (
              <LiveCard key={`${row.call.callId}-${row.occ.startMs}`} row={row} {...membership(row.call.spaceId)} />
            ))}
            {visibleUpcoming.map(row => (
              <UpcomingCard key={`${row.call.callId}-${row.occ.startMs}`} row={row} {...membership(row.call.spaceId)} />
            ))}
            {live.length === 0 && upcoming.length === 0 && (
              <p className="text-[16px] leading-[20px] text-grey-04">No live or upcoming calls.</p>
            )}
          </div>

          {hasMore ? (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(prev => !prev)}
              className="mt-3 self-start rounded-full border border-grey-02 py-1.5 pr-2.5 pl-2 text-[16px] leading-[18px] text-grey-04 transition-colors hover:border-text hover:text-text"
            >
              {showAll ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      )}
    </section>
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

function SpaceChip({ call }: { call: ExploreCall }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[16px] leading-[20px] text-grey-04">
      <span className="size-3 shrink-0 overflow-hidden rounded-full">
        <Avatar value={call.spaceName} avatarUrl={call.spaceImage} size={12} />
      </span>
      <span className="truncate">{call.spaceName}</span>
    </span>
  );
}

/**
 * Per-card action. Editors get an RSVP button (upcoming cards only — `showRsvp`;
 * curator's `isCreator`/editor-only gate on "RSVP via email" — regular members never
 * see it); everyone else gets the "Join space" / "Membership pending" text link. A
 * member viewing a live card has nothing to do (they just Join call), so the action
 * collapses.
 */
function CardAction({
  call,
  isMember,
  isEditor,
  pending,
  showRsvp = false,
}: {
  call: ExploreCall;
  isMember: boolean;
  isEditor: boolean;
  pending: boolean;
  showRsvp?: boolean;
}) {
  if (isMember) return showRsvp && isEditor ? <RsvpButton call={call} /> : null;
  return (
    <div className="shrink-0 whitespace-nowrap">
      <ExploreJoinSpaceButton spaceId={call.spaceId} hasRequestedSpaceMembership={pending} variant="text" />
    </div>
  );
}

function LiveCard({
  row,
  isMember,
  isEditor,
  pending,
}: {
  row: Row;
  isMember: boolean;
  isEditor: boolean;
  pending: boolean;
}) {
  return (
    <CardShell>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[16px] leading-[20px] font-medium text-red-01">
          <span className="size-2 animate-pulse rounded-full bg-red-01" />
          LIVE
        </span>
        <Link href={liveCallHref(row.call.spaceId, row.call.callId)}>
          <Button variant="primary">Join call</Button>
        </Link>
      </div>
      <Title row={row} />
      <ParticipantAvatarStrip spaceId={row.call.spaceId} callId={row.call.callId} occurrenceStart={row.occ.startMs} />
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-grey-02 pt-3">
        <SpaceChip call={row.call} />
        <CardAction call={row.call} isMember={isMember} isEditor={isEditor} pending={pending} />
      </div>
    </CardShell>
  );
}

function UpcomingCard({
  row,
  isMember,
  isEditor,
  pending,
}: {
  row: Row;
  isMember: boolean;
  isEditor: boolean;
  pending: boolean;
}) {
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-2">
        <Title row={row} />
        <CardAction call={row.call} isMember={isMember} isEditor={isEditor} pending={pending} showRsvp />
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <span className="shrink-0 text-[16px] leading-[20px] text-grey-04">{formatDateLabel(row.occ.startMs)}</span>
        <div className="flex items-center gap-2">
          <AddToCalendarMenu
            spaceId={row.call.spaceId}
            callId={row.call.callId}
            name={row.call.name}
            startMs={row.occ.startMs}
            endMs={row.occ.endMs}
            schedule={row.call.schedule}
          />
          <SpaceChip call={row.call} />
        </div>
      </div>
    </CardShell>
  );
}
