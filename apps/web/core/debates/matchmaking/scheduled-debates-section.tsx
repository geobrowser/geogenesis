'use client';

import * as React from 'react';

import Link from 'next/link';

import type { ScheduledDebateRequest, UpcomingDebateRoom } from '~/core/debates/api';
import { useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useRespondToScheduledDebate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

/**
 * Scheduled debates in the Requests tab (GEO-2939, GEO-2940).
 *
 * Answering here is the route, not a fallback for the email: the invited person accepts in the
 * app rather than going to find a message. The same rule covers joining, so an open room carries
 * its own Join and its own "they are waiting" line, and a dismissed popup loses nothing.
 */
export function ScheduledDebatesSection({ content }: { content: ScheduledContent }) {
  const { answerable, upcoming } = content;
  const respond = useRespondToScheduledDebate();
  const [conflict, setConflict] = React.useState<string | null>(null);

  if (answerable.length === 0 && upcoming.length === 0) return null;

  const answer = (requestId: string, accepted: boolean) => {
    setConflict(null);
    respond.mutate(
      { requestId, accepted },
      {
        onSuccess: result => {
          if (result.outcome === 'conflict') {
            setConflict(`That clashes with a debate at ${formatWhen(result.conflicting_start_at)}.`);
          }
        },
        onError: error => setConflict(error.message),
      }
    );
  };

  return (
    <>
      {upcoming.length > 0 && (
        <Section label="Upcoming debates">
          {upcoming.map(room => (
            <UpcomingRow key={room.room_id} room={room} />
          ))}
        </Section>
      )}

      {answerable.length > 0 && (
        <Section label="Scheduled">
          {answerable.map(request => (
            <ScheduledRow key={request.request_id} request={request} busy={respond.isPending} onAnswer={answer} />
          ))}
          {conflict && (
            <Text as="p" variant="footnote" color="red-01">
              {conflict}
            </Text>
          )}
        </Section>
      )}
    </>
  );
}

/**
 * What this tab has to show. Shared with the tab itself, which needs it for its empty state; both
 * reads hit the same query keys, so asking twice costs one request.
 */
export type ScheduledContent = {
  answerable: ScheduledDebateRequest[];
  upcoming: UpcomingDebateRoom[];
};

export function useScheduledContent(enabled: boolean): ScheduledContent {
  const requests = useScheduledDebates(enabled);
  const rooms = useUpcomingDebateRooms(enabled);

  const answerable = React.useMemo(
    () => (requests.data?.requests ?? []).filter(request => request.status === 'pending' && !request.room_id),
    [requests.data]
  );

  return { answerable, upcoming: rooms.data?.rooms ?? [] };
}

/** An open room says so and offers the way in; one that is not yet open says when. */
function UpcomingRow({ room }: { room: UpcomingDebateRoom }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-grey-02 p-3">
      <div className="flex min-w-0 flex-col">
        <Text as="span" variant="metadata">
          {room.due ? 'Starting now' : formatWhen(room.starts_at)}
        </Text>
        <Text as="span" variant="footnote" color="grey-04">
          {room.others_present
            ? 'Your opponent is waiting for you now'
            : room.joinable
              ? 'The room is open'
              : `Opens at ${formatTime(room.opens_at)}`}
        </Text>
      </div>
      {room.joinable && (
        <Link
          href={debateRoomPath(room.room_id)}
          className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white"
        >
          Join debate
        </Link>
      )}
    </div>
  );
}

function ScheduledRow({
  request,
  busy,
  onAnswer,
}: {
  request: ScheduledDebateRequest;
  busy: boolean;
  onAnswer: (requestId: string, accepted: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <Text as="span" variant="metadata">
        {formatWhen(request.scheduled_start_at)}
      </Text>
      <Text as="span" variant="footnote" color="grey-04">
        {request.viewer_must_answer ? 'Waiting on your answer' : 'Waiting on their answer'}
      </Text>

      {request.viewer_must_answer && (
        <div className="flex gap-2">
          <Button onClick={() => onAnswer(request.request_id, true)} disabled={busy}>
            Accept
          </Button>
          <Button variant="secondary" onClick={() => onAnswer(request.request_id, false)} disabled={busy}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <Text as="h3" variant="footnote" color="grey-04">
        {label}
      </Text>
      {children}
    </section>
  );
}

function formatWhen(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
