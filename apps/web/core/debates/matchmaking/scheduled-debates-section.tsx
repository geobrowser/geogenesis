'use client';

import * as React from 'react';

import type { DebateParticipantSummary, ScheduledDebateRequest, UpcomingDebateRoom } from '~/core/debates/api';
import { useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useRespondToScheduledDebate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import Link from 'next/link';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { useDebatePeople } from './hooks';
import { HubPillButton } from './hub-pill-button';

/**
 * Scheduled debates in the Requests tab (GEO-2939, GEO-2940). Answering and joining both happen
 * here, so neither depends on an email arriving or a popup being caught.
 */
export function ScheduledDebatesSection({ content }: { content: ScheduledContent }) {
  const { answerable, upcoming, requestsError, roomsError } = content;
  const respond = useRespondToScheduledDebate();
  const [conflict, setConflict] = React.useState<string | null>(null);
  const viewerId = useCurrentGeoChatUserId();
  const lookUp = useParticipantLookup(answerable.length > 0 || upcoming.length > 0);

  if (answerable.length === 0 && upcoming.length === 0 && !requestsError && !roomsError) return null;

  const answer = (requestId: string, accepted: boolean) => {
    setConflict(null);
    respond.mutate(
      { requestId, accepted },
      {
        onSuccess: result => {
          if (result.outcome === 'conflict') {
            setConflict(`That clashes with a debate ${formatDebateTime(result.conflicting_start_at)}.`);
          }
        },
        onError: error => setConflict(error.message),
      }
    );
  };

  return (
    <>
      {(upcoming.length > 0 || roomsError) && (
        <Section label="Upcoming debates">
          {upcoming.map(({ room, opponentUserId }) => (
            <UpcomingRow key={room.room_id} room={room} opponent={lookUp(opponentUserId)} />
          ))}
          {roomsError && <ReadFailed>Could not read your upcoming debates: {roomsError.message}</ReadFailed>}
        </Section>
      )}

      {(answerable.length > 0 || requestsError) && (
        <Section label="Scheduled">
          {requestsError && <ReadFailed>Could not read your scheduled debates: {requestsError.message}</ReadFailed>}
          {answerable.map(request => (
            <ScheduledRow
              key={request.request_id}
              request={request}
              opponent={lookUp(opponentOf(request, viewerId))}
              busy={respond.isPending}
              onAnswer={answer}
            />
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
  upcoming: UpcomingRoomRow[];
  /** Kept apart: one read failing must not hide what the other returned. */
  requestsError: Error | null;
  roomsError: Error | null;
};

/** A room carries no participants, so its opponent comes from the request that booked it. */
export type UpcomingRoomRow = { room: UpcomingDebateRoom; opponentUserId: string | null };

export function useScheduledContent(enabled: boolean): ScheduledContent {
  const requests = useScheduledDebates(enabled);
  const rooms = useUpcomingDebateRooms(enabled);
  const viewerId = useCurrentGeoChatUserId();

  const rows = requests.data?.requests;

  const answerable = React.useMemo(
    () => (rows ?? []).filter(request => request.status === 'pending' && !request.room_id),
    [rows]
  );

  const upcoming = React.useMemo(
    () =>
      (rooms.data?.rooms ?? []).map(room => ({
        room,
        opponentUserId: opponentOf(
          // The room's id is dashless here and dashed on the request, so these never match as written.
          (rows ?? []).find(request => request.room_id && sameId(request.room_id, room.room_id)),
          viewerId
        ),
      })),
    [rooms.data, rows, viewerId]
  );

  return { answerable, upcoming, requestsError: requests.error ?? null, roomsError: rooms.error ?? null };
}

/** `null` whenever the answer would be a guess, so nothing reads the viewer as their own opponent. */
function opponentOf(request: ScheduledDebateRequest | undefined, viewerId: string | null) {
  if (!request || !viewerId) return null;
  if (!request.participants.some(participant => sameId(participant.user_id, viewerId))) return null;
  return request.participants.find(participant => !sameId(participant.user_id, viewerId))?.user_id ?? null;
}

/** Names come from the roster, which only covers people who are online. */
function useParticipantLookup(enabled: boolean) {
  const people = useDebatePeople(enabled);

  return React.useMemo(() => {
    const byId = new Map<string, DebateParticipantSummary>();
    for (const person of people.data?.people ?? []) byId.set(normalizeId(person.user_id), person);
    return (userId: string | null) => (userId ? (byId.get(normalizeId(userId)) ?? null) : null);
  }, [people.data]);
}

function normalizeId(userId: string) {
  return userId.replace(/-/g, '').toLowerCase();
}

/** An open room says so and offers the way in; one that is not yet open says when. */
function UpcomingRow({ room, opponent }: { room: UpcomingDebateRoom; opponent: DebateParticipantSummary | null }) {
  return (
    <Row
      opponent={opponent}
      when={room.due ? 'Starting now' : formatDebateTime(room.starts_at)}
      note={
        room.others_present
          ? `${shortName(opponent)} is waiting for you now`
          : room.joinable
            ? 'The room is open'
            : `Opens at ${formatTime(room.opens_at)}`
      }
      urgent={room.others_present}
      action={
        room.joinable && (
          <Link href={debateRoomPath(room.room_id)} className={JOIN_PILL}>
            Join debate
          </Link>
        )
      }
    />
  );
}

function ScheduledRow({
  request,
  opponent,
  busy,
  onAnswer,
}: {
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  busy: boolean;
  onAnswer: (requestId: string, accepted: boolean) => void;
}) {
  return (
    <Row
      opponent={opponent}
      when={formatDebateTime(request.scheduled_start_at)}
      note={request.viewer_must_answer ? 'Waiting on your answer' : 'Waiting on their answer'}
      below={
        request.viewer_must_answer && (
          // Decline first, Accept primary on the right: the order every other request card uses.
          <div className="grid grid-cols-2 gap-2">
            <HubPillButton onClick={() => onAnswer(request.request_id, false)} disabled={busy}>
              Decline
            </HubPillButton>
            <HubPillButton variant="primary" onClick={() => onAnswer(request.request_id, true)} disabled={busy}>
              Accept
            </HubPillButton>
          </div>
        )
      }
    />
  );
}

/** The hub's pill, as a link. `HubPillButton` renders a button, which this cannot be. */
const JOIN_PILL =
  'inline-flex h-7 shrink-0 items-center justify-center rounded-full bg-text px-3 text-metadata whitespace-nowrap text-white transition-colors hover:bg-text/90';

/** One shape for both kinds of row: who, when, one line of why, and at most one action. */
function Row({
  opponent,
  when,
  note,
  urgent = false,
  action,
  below,
}: {
  opponent: DebateParticipantSummary | null;
  when: string;
  note: string;
  urgent?: boolean;
  action?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-grey-02 p-3">
      <div className="flex items-center gap-3">
        <Face opponent={opponent} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Name opponent={opponent} />
          <Text as="span" variant="footnote" color="grey-04" className="truncate">
            {when}
          </Text>
          <Text as="span" variant="footnote" color={urgent ? 'text' : 'grey-04'} className="truncate">
            {note}
          </Text>
        </div>
        {action}
      </div>
      {below}
    </div>
  );
}

function Face({ opponent }: { opponent: DebateParticipantSummary | null }) {
  return (
    <div className="shrink-0">
      <Avatar avatarUrl={opponent?.avatar_cid ?? null} value={opponent?.profile_space_id ?? 'scheduled'} size={32} />
    </div>
  );
}

/** A link only where the roster resolved them; a bare name is not a dead link. */
function Name({ opponent }: { opponent: DebateParticipantSummary | null }) {
  const href =
    opponent && validateSpaceId(opponent.profile_space_id) ? NavUtils.toSpace(opponent.profile_space_id) : null;
  const label = shortName(opponent);

  if (!href) {
    return (
      <Text as="span" variant="metadataMedium" className="truncate">
        {label}
      </Text>
    );
  }

  return (
    <Link href={href} className="truncate text-metadataMedium hover:underline">
      {label}
    </Link>
  );
}

function shortName(opponent: DebateParticipantSummary | null) {
  return opponent?.display_name || 'Your opponent';
}

function ReadFailed({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="footnote" color="red-01">
      {children}
    </Text>
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

/** `Today at 1:00 PM`, `Tomorrow at ...`, else `Thu, Sep 24 at ...`. */
export function formatDebateTime(iso: string, now = new Date()) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;

  const days = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return `${day} at ${formatTime(iso)}`;
}

function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
