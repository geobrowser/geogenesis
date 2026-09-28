'use client';

import * as React from 'react';

import Link from 'next/link';

import { personProfileOpened } from '~/core/analytics';
import type { DebateParticipantSummary, ScheduledDebateRequest, UpcomingDebateRoom } from '~/core/debates/api';
import { speakerLabel } from '~/core/debates/playback-utils';
import { useFinishedRoomIds, useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useRespondToScheduledDebate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Date as DateIcon } from '~/design-system/icons/date';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { useDebatePeople } from './hooks';
import { HubPillButton } from './hub-pill-button';
import { PersonMatches } from './person-disagreements';
import { PersonRecordLine } from './person-record-line';
import { PersonSpaceIcons } from './person-space-icons';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { type PersonMatchContext, usePersonMatchContext } from './use-person-match-context';

/**
 * Scheduled debates in the Requests tab (GEO-2939, GEO-2940). Answering and joining both happen
 * here, so neither depends on an email arriving or a popup being caught.
 */
export function ScheduledDebatesSection({ content }: { content: ScheduledContent }) {
  const { answerable, upcoming, people, requestsError, roomsError } = content;
  const respond = useRespondToScheduledDebate();
  const [conflict, setConflict] = React.useState<string | null>(null);
  const viewerId = useCurrentGeoChatUserId();
  const lookUp = useParticipantLookup(answerable.length > 0 || upcoming.length > 0, people);

  // Everyone a row names, resolved in one batch for the stats line the People tab draws.
  const opponents = React.useMemo(
    () =>
      [
        ...answerable.map(request => lookUp(opponentOf(request, viewerId))),
        ...upcoming.map(({ opponentUserId }) => lookUp(opponentUserId)),
      ].filter((opponent): opponent is DebateParticipantSummary => opponent !== null),
    [answerable, lookUp, upcoming, viewerId]
  );
  const opponentSpaceIds = React.useMemo(() => opponents.map(opponent => opponent.profile_space_id), [opponents]);
  const context = usePersonMatchContext(opponentSpaceIds);
  // One elevated portal for every row's popovers, so they clear this z-200 panel.
  const popoverPortal = useElevatedPopoverPortal();

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
            <UpcomingRow
              key={room.room_id}
              room={room}
              opponent={lookUp(opponentUserId)}
              context={context}
              popoverPortal={popoverPortal}
            />
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
              context={context}
              popoverPortal={popoverPortal}
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
  /** Who the requests' other participants are, resolved from the graph. Empty until that lands. */
  people: DebateParticipantSummary[];
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

  const roomList = React.useMemo(() => rooms.data?.rooms ?? [], [rooms.data]);
  const finishedRoomIds = useFinishedRoomIds(roomList, enabled);

  const upcoming = React.useMemo(
    () =>
      roomList
        .filter(room => !finishedRoomIds.has(room.room_id))
        .map(room => ({
          room,
          opponentUserId: opponentOf(
            // The room's id is dashless here and dashed on the request, so these never match as written.
            (rows ?? []).find(request => request.room_id && sameId(request.room_id, room.room_id)),
            viewerId
          ),
        })),
    [finishedRoomIds, roomList, rows, viewerId]
  );

  // Everyone but the viewer, who is never the one a row names.
  const otherUserIds = React.useMemo(
    () =>
      (rows ?? []).flatMap(request =>
        request.participants
          .map(participant => participant.user_id)
          .filter(userId => !viewerId || !sameId(userId, viewerId))
      ),
    [rows, viewerId]
  );
  const people = useGeoChatUserSummaries(otherUserIds, enabled);

  return { answerable, upcoming, people, requestsError: requests.error ?? null, roomsError: rooms.error ?? null };
}

/** `null` whenever the answer would be a guess, so nothing reads the viewer as their own opponent. */
function opponentOf(request: ScheduledDebateRequest | undefined, viewerId: string | null) {
  if (!request || !viewerId) return null;
  if (!request.participants.some(participant => sameId(participant.user_id, viewerId))) return null;
  return request.participants.find(participant => !sameId(participant.user_id, viewerId))?.user_id ?? null;
}

/**
 * Names come from the graph, since a geo-chat user id is their personal space's page entity. The
 * roster is only a fallback while that loads: it covers people who are online, and whoever invited
 * you usually is not.
 */
function useParticipantLookup(enabled: boolean, requestPeople: DebateParticipantSummary[]) {
  const roster = useDebatePeople(enabled);

  return React.useMemo(() => {
    const byId = new Map<string, DebateParticipantSummary>();
    for (const person of roster.data?.people ?? []) byId.set(normalizeId(person.user_id), person);
    // Written second so the graph's record wins over the roster's.
    for (const person of requestPeople) byId.set(normalizeId(person.user_id), person);
    return (userId: string | null) => (userId ? (byId.get(normalizeId(userId)) ?? null) : null);
  }, [requestPeople, roster.data]);
}

function normalizeId(userId: string) {
  return userId.replace(/-/g, '').toLowerCase();
}

/** An open room says so and offers the way in; one that is not yet open says when. */
function UpcomingRow({
  room,
  opponent,
  context,
  popoverPortal,
}: {
  room: UpcomingDebateRoom;
  opponent: DebateParticipantSummary | null;
  context: PersonMatchContext;
  popoverPortal: HTMLElement | null;
}) {
  return (
    <ScheduleCard
      opponent={opponent}
      context={context}
      popoverPortal={popoverPortal}
      when={room.due ? 'Starting now' : formatDebateTime(room.starts_at)}
      status={
        room.others_present
          ? `${shortName(opponent)} is waiting for you now`
          : room.joinable
            ? 'The room is open'
            : `Opens at ${formatTime(room.opens_at)}`
      }
      urgent={room.others_present}
      actions={
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
  context,
  popoverPortal,
  busy,
  onAnswer,
}: {
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  context: PersonMatchContext;
  popoverPortal: HTMLElement | null;
  busy: boolean;
  onAnswer: (requestId: string, accepted: boolean) => void;
}) {
  return (
    <ScheduleCard
      opponent={opponent}
      context={context}
      popoverPortal={popoverPortal}
      when={formatDebateSlot(request.scheduled_start_at, request.scheduled_end_at)}
      status={request.viewer_must_answer ? 'Waiting on your answer' : 'Waiting on their answer'}
      actions={
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

/** The hub's pill, as a full-width link. `HubPillButton` renders a button, which this cannot be. */
const JOIN_PILL =
  'inline-flex h-7 w-full items-center justify-center rounded-full bg-text px-3 text-metadata whitespace-nowrap text-white transition-colors hover:bg-text/90';

/**
 * One shape for both kinds of card, laid out like the instant request card: a header carrying the
 * time and where things stand, the other debater in the same inset strip the request cards use,
 * then the actions.
 *
 * The time leads because it is what a scheduled request is *about* — the one thing an instant
 * request never has — so it gets the header to itself rather than a footnote under the name.
 */
function ScheduleCard({
  opponent,
  context,
  popoverPortal,
  when,
  status,
  urgent = false,
  actions,
}: {
  opponent: DebateParticipantSummary | null;
  context: PersonMatchContext;
  popoverPortal: HTMLElement | null;
  when: string;
  status: string;
  urgent?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <article className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3">
      {/* The time on its own line, with where things stand under it: side by side, a slot and a
          sentence crowd each other out at this width, and it was the status that lost. */}
      <div className="flex items-start gap-2">
        <DateIcon className="mt-0.5 shrink-0 text-text" />
        <div className="flex min-w-0 flex-col">
          <Text as="span" variant="metadataMedium">
            {when}
          </Text>
          <Text as="span" variant="footnote" color={urgent ? 'text' : 'grey-04'}>
            {status}
          </Text>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg bg-grey-01 px-3 py-3">
        <Face opponent={opponent} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Name opponent={opponent} />
          {opponent && <OpponentRecord opponent={opponent} context={context} popoverPortal={popoverPortal} />}
        </div>
      </div>

      {actions}
    </article>
  );
}

function Face({ opponent }: { opponent: DebateParticipantSummary | null }) {
  return (
    <div className="shrink-0">
      <Avatar avatarUrl={opponent?.avatar_cid ?? null} value={opponent?.profile_space_id ?? 'scheduled'} size={32} />
    </div>
  );
}

/** The People tab's stats line — debates, positions, matches, active spaces — for this opponent. */
function OpponentRecord({
  opponent,
  context,
  popoverPortal,
}: {
  opponent: DebateParticipantSummary;
  context: PersonMatchContext;
  popoverPortal: HTMLElement | null;
}) {
  const profileSpaceId = opponent.profile_space_id;
  const record = context.record(profileSpaceId);
  const matches = context.matches(profileSpaceId);
  const spaceIds = context.activeSpaceIds(profileSpaceId);

  const activeSpaces =
    spaceIds.length > 0 ? (
      <PersonSpaceIcons
        spaceIds={spaceIds}
        labelsById={context.labelsById}
        claimsBySpace={record?.claimsBySpace}
        debatesBySpace={record?.debatesBySpace}
        matchesBySpace={context.matchesBySpace(profileSpaceId)}
        popoverPortal={popoverPortal}
      />
    ) : null;
  const match =
    matches.length > 0 ? (
      <PersonMatches
        personName={speakerLabel(opponent)}
        matches={matches}
        claimNamesById={context.claimNamesById}
        claimNamesLoading={context.claimNamesLoading}
        labelsById={context.labelsById}
        popoverPortal={popoverPortal}
      />
    ) : null;

  if (!record && !activeSpaces && !match) return null;

  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-0.5">
      <PersonRecordLine record={record} match={match} activeSpaces={activeSpaces} />
    </div>
  );
}

/** A link only where the graph or roster resolved them; a bare name is not a dead link. */
function Name({ opponent }: { opponent: DebateParticipantSummary | null }) {
  const profileSpaceId = opponent && validateSpaceId(opponent.profile_space_id) ? opponent.profile_space_id : null;
  const label = shortName(opponent);

  if (!profileSpaceId) {
    return (
      <Text as="span" variant="metadataMedium" className="truncate">
        {label}
      </Text>
    );
  }

  return (
    <Link
      href={NavUtils.toSpace(profileSpaceId)}
      onClick={() => personProfileOpened(profileSpaceId, null, { interaction_surface: 'debates_hub_requests' })}
      className="truncate text-metadataMedium hover:underline"
    >
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

  return `${formatDay(at, now)} at ${formatTime(iso)}`;
}

function formatDay(at: Date, now: Date) {
  const days = Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / 86_400_000);
  return days === 0
    ? 'Today'
    : days === 1
      ? 'Tomorrow'
      : at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** `Tomorrow, 11:00 – 11:30 AM`: the day once, then the slot. Falls back to the start alone. */
export function formatDebateSlot(startIso: string, endIso: string, now = new Date()) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return formatDebateTime(startIso, now);
  }
  const from = formatTime(startIso);
  const to = formatTime(endIso);
  // `11:00 – 11:30 AM` rather than `11:00 AM – 11:30 AM`, when both ends share the period.
  const period = /\s?([AP]M)$/i;
  const fromPeriod = from.match(period)?.[1];
  const shared = fromPeriod !== undefined && fromPeriod === to.match(period)?.[1];
  return `${formatDay(start, now)}, ${shared ? from.replace(period, '') : from} – ${to}`;
}

function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
