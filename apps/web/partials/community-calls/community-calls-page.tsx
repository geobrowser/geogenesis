'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { listRecordings, notifyCommunityCallCancel } from '~/core/community-calls/api';
import { buildDeleteCallOps } from '~/core/community-calls/call-ops';
import { agendaHref, buildRoomName, detailsHref, liveCallHref } from '~/core/community-calls/constants';
import { formatDateLabel, formatTimeRange } from '~/core/community-calls/format';
import { bucketOccurrences, getOccurrences } from '~/core/community-calls/occurrences';
import { CallSeries, Occurrence, Recording } from '~/core/community-calls/types';
import { useCommunityCallIdentityToken } from '~/core/community-calls/use-identity-token';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePublish } from '~/core/hooks/use-publish';
import { getRelationsByFromEntityId } from '~/core/io/queries';
import { renderMarkdownDocument } from '~/core/state/editor/markdown-render';
import { NavUtils } from '~/core/utils/utils';

import { Button, SmallButton } from '~/design-system/button';
import { Dialog } from '~/design-system/dialog';
import { Dropdown } from '~/design-system/dropdown';
import { Ellipsis } from '~/design-system/icons/ellipsis';
import { Plus } from '~/design-system/icons/plus';
import { Time } from '~/design-system/icons/time';

import { AddToCalendarMenu } from './add-to-calendar-menu';
import { RecordingPlayer } from './recording-player';
import { RsvpButton } from './rsvp-button';

type Row = { call: CallSeries; occ: Occurrence };

function flatten(series: CallSeries[], now: number) {
  const live: Row[] = [];
  const upcoming: Row[] = [];
  const past: Row[] = [];

  for (const call of series) {
    const buckets = bucketOccurrences(getOccurrences(call.schedule, now), now);
    if (buckets.live) live.push({ call, occ: buckets.live });
    for (const occ of buckets.upcoming) upcoming.push({ call, occ });
    for (const occ of buckets.past) past.push({ call, occ });
  }

  upcoming.sort((a, b) => a.occ.startMs - b.occ.startMs);
  past.sort((a, b) => b.occ.startMs - a.occ.startMs);
  return { live, upcoming, past };
}

function rowKey(row: Row): string {
  return `${row.call.callId}-${row.occ.startMs}`;
}

export function CommunityCallsPage({
  spaceId,
  spaceName,
  series,
}: {
  spaceId: string;
  spaceName: string;
  series: CallSeries[];
}) {
  // Compute "now" after mount so SSR/CSR time bucketing can't diverge (hydration-safe),
  // then keep refreshing so calls transition between sections without a full reload.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Past occurrences paginate after 10, same as data blocks.
  const PAST_PAGE = 10;
  const [pastLimit, setPastLimit] = React.useState(PAST_PAGE);

  const { isEditor } = useAccessControl(spaceId);
  const { identityToken, getToken } = useCommunityCallIdentityToken();

  const { data: recordingsData } = useQuery({
    queryKey: ['community-call-recordings', spaceId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { recordings: [] };
      return listRecordings(token);
    },
    enabled: isEditor && Boolean(identityToken),
  });
  const recordings: Recording[] = recordingsData?.recordings ?? [];

  const buckets = React.useMemo(() => {
    if (now === null) return null;
    return flatten(series, now);
  }, [series, now]);

  if (buckets === null) {
    return <div className="py-10 text-grey-04">Loading community calls…</div>;
  }

  const empty = buckets.live.length === 0 && buckets.upcoming.length === 0 && buckets.past.length === 0;

  return (
    <div className="flex flex-col gap-10 py-4">
      {buckets.live.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-smallTitle">Live now</h3>
          {buckets.live.map(row => (
            <LiveCallCard key={rowKey(row)} spaceId={spaceId} row={row} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-smallTitle">Upcoming</h3>
          {isEditor && (
            <Link href={`/space/${spaceId}/community/new`} aria-label="Schedule a call">
              <Plus />
            </Link>
          )}
        </div>
        {buckets.upcoming.length === 0 ? (
          <p className="text-metadata text-grey-04">No upcoming calls scheduled.</p>
        ) : (
          buckets.upcoming.map(row => <UpcomingRow key={rowKey(row)} row={row} isEditor={isEditor} />)
        )}
      </section>

      {buckets.past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-smallTitle">Past</h3>
          {buckets.past.slice(0, pastLimit).map(row => (
            <PastRow key={rowKey(row)} spaceId={spaceId} row={row} recordings={recordings} isEditor={isEditor} />
          ))}
          {buckets.past.length > pastLimit && (
            <SmallButton onClick={() => setPastLimit(n => n + PAST_PAGE)}>Show more</SmallButton>
          )}
        </section>
      )}

      {empty && (
        <p className="text-metadata text-grey-04">No community calls in {spaceName} yet. Use the + to schedule one.</p>
      )}
    </div>
  );
}

function RowShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-grey-02 p-4">{children}</div>;
}

function CallTitle({ row }: { row: Row }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-button">{row.call.name}</span>
      <span className="flex items-center gap-1 text-metadata text-grey-04">
        <Time />
        {formatTimeRange(row.occ.startMs, row.occ.endMs)}
      </span>
    </div>
  );
}

function LiveCallCard({ spaceId, row }: { spaceId: string; row: Row }) {
  return (
    <RowShell>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 text-metadataMedium text-red-01">
            <span className="size-1.5 animate-pulse rounded-full bg-red-01" />
            LIVE
          </span>
          <CallTitle row={row} />
        </div>
        <div className="flex items-center gap-2">
          <Link href={agendaHref(spaceId, row.call.callId, row.occ.startMs, row.occ.endMs)}>
            <SmallButton>Agenda</SmallButton>
          </Link>
          <Link href={NavUtils.toEntity(spaceId, row.call.callId)}>
            <SmallButton>Entity</SmallButton>
          </Link>
          <Link href={liveCallHref(spaceId, row.call.callId)}>
            <Button variant="primary">Join call</Button>
          </Link>
        </div>
      </div>
    </RowShell>
  );
}

function UpcomingRow({ row, isEditor }: { row: Row; isEditor: boolean }) {
  'use no memo';

  const router = useRouter();
  const { getToken } = useCommunityCallIdentityToken();
  const { makeProposal } = usePublish();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const onDelete = async () => {
    setDeleting(true);
    const existingBlockRelations = await Effect.runPromise(
      getRelationsByFromEntityId(row.call.callId, SystemIds.BLOCKS, row.call.spaceId)
    ).catch(() => []);
    const { values, relations } = buildDeleteCallOps({
      entityId: row.call.callId,
      spaceId: row.call.spaceId,
      name: row.call.name,
      existingBlockRelations,
    });

    // Fire before the on-chain write starts, not in onSuccess — curator-backend needs to
    // read the pre-delete `meetingTime` to send the cancellation, and that value may
    // already be gone by the time a post-publish callback runs.
    const notifyToken = await getToken();
    if (notifyToken)
      await notifyCommunityCallCancel({ spaceId: row.call.spaceId, callId: row.call.callId }, notifyToken).catch(
        () => {}
      );

    await makeProposal({
      values,
      relations,
      spaceId: row.call.spaceId,
      name: `Delete ${row.call.name}`,
      onSuccess: () => router.refresh(),
      onError: () => {
        setDeleting(false);
        setConfirmingDelete(false);
      },
    });
  };

  if (confirmingDelete) {
    return (
      <RowShell>
        <div className="flex items-center justify-between">
          <span className="text-metadata text-text">Delete “{row.call.name}” and cancel it for everyone?</span>
          <div className="flex items-center gap-2">
            <SmallButton onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </SmallButton>
            <SmallButton onClick={onDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete call'}
            </SmallButton>
          </div>
        </div>
      </RowShell>
    );
  }

  return (
    <RowShell>
      <div className="mb-2 text-metadata text-grey-04">{formatDateLabel(row.occ.startMs)}</div>
      <div className="flex items-start justify-between">
        <CallTitle row={row} />
        <div className="flex items-center gap-2">
          <AddToCalendarMenu
            spaceId={row.call.spaceId}
            callId={row.call.callId}
            name={row.call.name}
            startMs={row.occ.startMs}
            endMs={row.occ.endMs}
            schedule={row.call.schedule}
          />
          {isEditor && <RsvpButton call={row.call} />}
          <Dropdown
            trigger={<Ellipsis />}
            align="end"
            options={[
              {
                label: 'Agenda',
                value: 'agenda',
                disabled: false,
                onClick: () =>
                  router.push(agendaHref(row.call.spaceId, row.call.callId, row.occ.startMs, row.occ.endMs)),
              },
              {
                label: 'Entity',
                value: 'entity',
                disabled: false,
                onClick: () => router.push(NavUtils.toEntity(row.call.spaceId, row.call.callId)),
              },
              {
                label: 'Copy link',
                value: 'copy',
                disabled: false,
                onClick: () =>
                  navigator.clipboard?.writeText(
                    new URL(
                      agendaHref(row.call.spaceId, row.call.callId, row.occ.startMs, row.occ.endMs),
                      window.location.origin
                    ).toString()
                  ),
              },
              ...(isEditor
                ? [
                    {
                      label: 'Edit call',
                      value: 'edit',
                      disabled: false,
                      onClick: () => router.push(`/space/${row.call.spaceId}/community/${row.call.callId}/edit`),
                    },
                    {
                      label: 'Delete call',
                      value: 'delete',
                      disabled: false,
                      onClick: () => setConfirmingDelete(true),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
      {row.call.description && (
        <div className="mt-2 text-metadata text-grey-04">{renderMarkdownDocument(row.call.description)}</div>
      )}
    </RowShell>
  );
}

function PastRow({
  spaceId,
  row,
  recordings,
  isEditor,
}: {
  spaceId: string;
  row: Row;
  recordings: Recording[];
  isEditor: boolean;
}) {
  const roomName = buildRoomName(spaceId, row.call.callId, row.occ.startMs);
  const occRecordings = recordings.filter(r => r.roomName === roomName);

  return (
    <RowShell>
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 text-metadata text-grey-04">{formatDateLabel(row.occ.startMs)}</div>
          <CallTitle row={row} />
          {row.call.description && (
            <div className="mt-2 text-metadata text-grey-04">{renderMarkdownDocument(row.call.description)}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {occRecordings.length > 0 && (
            <Dialog
              trigger={<SmallButton>Watch recording</SmallButton>}
              header={<span className="text-smallTitle">{row.call.name}</span>}
              content={<RecordingPlayer recordings={occRecordings} />}
            />
          )}
          <Link href={agendaHref(spaceId, row.call.callId, row.occ.startMs, row.occ.endMs)}>
            <SmallButton>Agenda</SmallButton>
          </Link>
          {isEditor && (
            <Link href={detailsHref(spaceId, row.call.callId, row.occ.startMs, row.occ.endMs)}>
              <SmallButton>Details</SmallButton>
            </Link>
          )}
          <Link href={NavUtils.toEntity(spaceId, row.call.callId)}>
            <SmallButton>Entity</SmallButton>
          </Link>
        </div>
      </div>
    </RowShell>
  );
}
