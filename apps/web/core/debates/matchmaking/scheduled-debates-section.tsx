'use client';

import * as React from 'react';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import {
  type DebateParticipantSummary,
  type ScheduledDebateRequest,
  type UpcomingDebateRoom,
} from '~/core/debates/api';
import { useDebateLobbies } from '~/core/debates/lobbies/hooks';
import { markLobbyEntry } from '~/core/debates/lobbies/lobby-analytics';
import { debateEntryClick } from '~/core/debates/lobbies/step-out';
import { useMinuteNow } from '~/core/debates/lobbies/use-minute-now';
import { useFinishedRoomIds, useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { SCHEDULED_NOTICE_COPY, UNNAMED_OPPONENT } from '~/core/debates/rooms/room-copy';
import { opponentName, opponentOf, requestForRoom } from '~/core/debates/rooms/room-opponent';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useOpenScheduledRequests } from '~/core/debates/rooms/scheduled-awaiting';
import { noticeRequestState } from '~/core/debates/rooms/scheduled-notice';
import { useCancelScheduledDebate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';
import { cancelFailureMessage } from '~/core/debates/rooms/scheduling-refusals';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { normId } from '~/core/utils/norm-id';

import { Date as DateIcon } from '~/design-system/icons/date';
import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import { useDebatePeople } from './hooks';
import { type DebateAnalyticsSurface, debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { HubCardList, hubCardMotion } from './hub-motion';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import { RequestParties } from './request-parties';
import { RequestSection } from './request-section';
import { formatDebateSlot, formatDebateTime, formatTime } from './scheduled-debate-format';
import { type UpcomingLobbyRow, lobbyHostLine, upcomingLobbyRows } from './upcoming-lobby-rows';
import { useAnswerOnce } from './use-answer-once';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { useRequestCountdown } from './use-request-countdown';
import { type ScheduledDebateAnswer, useScheduledDebateAnswer } from './use-scheduled-debate-answer';

export { formatDebateSlot, formatDebateTime } from './scheduled-debate-format';

/**
 * Scheduled debates in the Requests tab (GEO-2939, GEO-2940). Answering and joining both happen
 * here, so neither depends on an email arriving or a popup being caught.
 */
export function ScheduledDebatesSection({ content }: { content: ScheduledContent }) {
  const { answerable, upcoming, lobbies, people, requestsError, roomsError, lobbiesError } = content;
  const { answer, busy, error: conflict } = useScheduledDebateAnswer();
  const viewerId = useCurrentGeoChatUserId();
  const lookUp = useParticipantLookup(answerable.length > 0 || upcoming.length > 0, people);
  const { reschedulerFor, reschedulingModal } = useRescheduler(lookUp);

  // The strip's left-hand side. Resolved like anyone else, so it carries the viewer's own face.
  const viewer = lookUp(viewerId);

  if (!hasScheduledContent(content)) return null;

  return (
    <>
      {(upcoming.length > 0 || roomsError) && (
        <RequestSection label="Upcoming debates">
          {upcoming.map(({ room, opponentUserId, scheduledEndAt, requestId }) => (
            <UpcomingRow
              key={room.room_id}
              room={room}
              requestId={requestId}
              scheduledEndAt={scheduledEndAt}
              opponent={lookUp(opponentUserId)}
              viewer={viewer}
              onReschedule={reschedulerFor(requestId, opponentUserId, 'requests_reschedule')}
            />
          ))}
          {roomsError && <ReadFailed>{READ_FAILURE_COPY.rooms(roomsError)}</ReadFailed>}
        </RequestSection>
      )}

      {/* Their own section, so a lobby is never read as a 1:1 (GEO-3292). */}
      {(lobbies.length > 0 || lobbiesError) && (
        <RequestSection label="Upcoming lobbies">
          {lobbies.map(row => (
            <UpcomingLobbyRowCard key={row.lobbyId} row={row} />
          ))}
          {/* The lobbies the viewer hosts come only from this read, so a failure is not "none". */}
          {lobbiesError && <ReadFailed>{READ_FAILURE_COPY.lobbies(lobbiesError)}</ReadFailed>}
        </RequestSection>
      )}

      {(answerable.length > 0 || requestsError) && (
        <RequestSection label="Scheduled">
          {requestsError && <ReadFailed>{READ_FAILURE_COPY.requests(requestsError)}</ReadFailed>}
          {/* The instant cards' list, so one that expires folds away the way theirs do. */}
          <HubCardList>
            {answerable.map(request => {
              const opponentUserId = opponentOf(request, viewerId);
              return (
                <ScheduledRow
                  key={request.request_id}
                  request={request}
                  opponent={lookUp(opponentUserId)}
                  viewer={viewer}
                  viewerId={viewerId}
                  busy={busy}
                  onAnswer={answer}
                  onReschedule={reschedulerFor(
                    request.request_id,
                    opponentUserId,
                    // "Choose different time" on an unanswered invite; Reschedule once accepted.
                    request.viewer_must_answer ? 'requests_new_time' : 'requests_reschedule'
                  )}
                />
              );
            })}
          </HubCardList>
          {conflict && (
            <Text as="p" variant="footnote" color="red-01">
              {conflict}
            </Text>
          )}
        </RequestSection>
      )}

      {/* The week the scheduling emails' "Choose different time" opens, in the same reschedule
          mode: picking a slot moves this request rather than proposing a new one. */}
      {reschedulingModal}
    </>
  );
}

/**
 * What a failed read says: one failing must not read as an empty schedule. The same words on the
 * section and on the panel's timeline (GEO-3463), which lists them together above its now-line.
 */
export const READ_FAILURE_COPY = {
  rooms: (error: Error) => `Could not read your upcoming debates: ${error.message}`,
  requests: (error: Error) => `Could not read your scheduled debates: ${error.message}`,
  lobbies: (error: Error) => `Could not read your lobbies: ${error.message}`,
};

/** Every read that failed, in the timeline's order. */
export function readFailureMessages(content: Pick<ScheduledContent, 'roomsError' | 'requestsError' | 'lobbiesError'>) {
  return [
    content.roomsError && READ_FAILURE_COPY.rooms(content.roomsError),
    content.requestsError && READ_FAILURE_COPY.requests(content.requestsError),
    content.lobbiesError && READ_FAILURE_COPY.lobbies(content.lobbiesError),
  ].filter((message): message is string => Boolean(message));
}

/** A debate being moved: whose week to open, the request it moves, and which button asked. */
type Rescheduling = { requestId: string; opponentUserId: string; opponentName: string | null; entry: ScheduleEntry };

/**
 * Who may do what with a pending scheduled request. Whoever proposed the current time may withdraw
 * it, and so may anyone who has already accepted it (GEO-3233: in an admin match neither debater
 * proposed it). Someone who has not answered declines instead. Shared by this section's card and the
 * panel's schedule (GEO-3463), so the two cannot offer different actions on one request.
 */
export function scheduledRequestRoles(request: ScheduledDebateRequest, viewerId: string | null) {
  const proposedByViewer =
    viewerId !== null && request.proposed_by_user_id !== null && sameId(request.proposed_by_user_id, viewerId);
  const viewerAccepted =
    viewerId !== null && request.participants.some(entry => entry.accepted === true && sameId(entry.user_id, viewerId));
  const withdrawable = !request.viewer_must_answer && (proposedByViewer || viewerAccepted);
  return { proposedByViewer, viewerAccepted, withdrawable };
}

/**
 * Whether a booked room can still be called off or moved. geo-chat refuses once anyone has joined
 * (`debate_already_started`), so the buttons go first. The room's session is created on first join,
 * so a non-null one means someone has been in even if they have since left and `others_present` no
 * longer says so.
 */
export function roomCancellable(row: Pick<UpcomingRoomRow, 'room' | 'requestId'>) {
  return row.requestId !== null && !row.room.others_present && !row.room.rematch_session_id;
}

/** A booked room's state in words, the same on the section's card and the panel's timeline. */
export function roomStatusLabel(room: UpcomingDebateRoom, opponent: DebateParticipantSummary | null) {
  return room.others_present
    ? `${opponentName(opponent)} is waiting for you now`
    : room.joinable
      ? 'The room is open'
      : `Opens at ${formatTime(room.opens_at)}`;
}

/**
 * A scheduled request a link asked to see (GEO-3431), and whether it is still here to show.
 *
 * Not until every read has landed: anything loading above it would push it back out of view after
 * the scroll. A link to a request that is no longer here (answered, withdrawn or lapsed since the
 * email, or another account's) says so rather than opening on nothing. Never for an accepted one: its
 * card is under the booked debates, which another read fills, so it can be a poll behind; either way
 * the debate is on. And not when the requests read failed: the read-failed line already says why.
 */
export function useLinkedScheduledRequest(
  focusedRequestId: string | null,
  content: Pick<ScheduledContent, 'answerable' | 'upcoming' | 'requestsError' | 'loading'>
) {
  const focusedId = content.loading ? null : focusedRequestId;
  const isFocused = React.useCallback(
    (requestId: string | null) => focusedId !== null && requestId !== null && sameId(focusedId, requestId),
    [focusedId]
  );
  const { data: scheduledRequests } = useScheduledDebates();
  const linkedShown =
    content.answerable.some(request => isFocused(request.request_id)) ||
    content.upcoming.some(row => isFocused(row.requestId));
  const linkedState =
    focusedId !== null && !linkedShown && !content.requestsError
      ? noticeRequestState(scheduledRequests?.requests.find(request => sameId(request.request_id, focusedId)))
      : null;
  // A pending one not listed lapsed at its start, which reads as over.
  const linkGone: 'missing' | 'over' | null =
    linkedState === 'missing' ? 'missing' : linkedState && linkedState !== 'active' ? 'over' : null;
  return { focusedId, isFocused, linkedShown, linkGone };
}

/** What a link to a request no longer here says, in the Running late dialog's words. */
export function LinkGoneNotice({ state, className }: { state: 'missing' | 'over'; className?: string }) {
  return (
    <div role="status" className={className}>
      <Text as="p" variant="footnote" color="grey-04">
        {SCHEDULED_NOTICE_COPY.state[state]}
      </Text>
    </div>
  );
}

/**
 * Moving a scheduled debate on the other debater's week. One at a time, so the modal lives with the
 * list rather than per row, and closing it hands focus back to the row's button. `reschedulerFor` is
 * null when there is no request to move or no week to move it on.
 */
export function useRescheduler(lookUp: (userId: string | null) => DebateParticipantSummary | null) {
  const [rescheduling, setRescheduling] = React.useState<Rescheduling | null>(null);
  const rescheduleOpenerRef = React.useRef<HTMLElement | null>(null);

  const reschedulerFor = (requestId: string | null, opponentUserId: string | null, entry: ScheduleEntry) =>
    requestId && opponentUserId
      ? (opener: HTMLElement) => {
          rescheduleOpenerRef.current = opener;
          setRescheduling({
            requestId,
            opponentUserId,
            opponentName: lookUp(opponentUserId)?.display_name ?? null,
            entry,
          });
        }
      : null;

  const reschedulingModal = (
    <PeerAvailabilityBookingModal
      open={rescheduling !== null}
      userId={rescheduling?.opponentUserId ?? ''}
      peerName={rescheduling?.opponentName}
      rescheduleRequestId={rescheduling?.requestId ?? null}
      entry={rescheduling?.entry ?? null}
      openerRef={rescheduleOpenerRef}
      onClose={() => setRescheduling(null)}
    />
  );

  return { reschedulerFor, reschedulingModal };
}

/**
 * What this tab has to show. Shared with the tab itself, which needs it for its empty state; both
 * reads hit the same query keys, so asking twice costs one request.
 */
export type ScheduledContent = {
  answerable: ScheduledDebateRequest[];
  upcoming: UpcomingRoomRow[];
  /** Lobbies the viewer said Going to or hosts, soonest first. */
  lobbies: UpcomingLobbyRow[];
  /** Who the requests' participants are, resolved from the graph. Empty until that lands. */
  people: DebateParticipantSummary[];
  /** Kept apart: one read failing must not hide what the others returned. */
  requestsError: Error | null;
  roomsError: Error | null;
  /** The lobby list, which hosted lobbies and hosts' names come from. */
  lobbiesError: Error | null;
  /** Any of the three reads still on its first load. */
  loading: boolean;
};

/** Anything for this section to show, a failed read included: one is not an empty schedule. */
export function hasScheduledContent(content: ScheduledContent) {
  const { answerable, upcoming, lobbies, requestsError, roomsError, lobbiesError } = content;
  return (
    answerable.length > 0 ||
    upcoming.length > 0 ||
    lobbies.length > 0 ||
    requestsError !== null ||
    roomsError !== null ||
    lobbiesError !== null
  );
}

/** A room's opponent and scheduled end come from the request that booked it. */
export type UpcomingRoomRow = {
  room: UpcomingDebateRoom;
  opponentUserId: string | null;
  scheduledEndAt: string | null;
  /** The accepted request that booked the room, which is what Cancel calls off. */
  requestId: string | null;
};

export function useScheduledContent(): ScheduledContent {
  const requests = useScheduledDebates();
  const rooms = useUpcomingDebateRooms();
  const viewerId = useCurrentGeoChatUserId();
  // For hosts' names and the viewer's own scheduled lobbies. Kept current by
  // `debate.lobbies_changed`, as on the side panel card, so a copy this fresh need not be refetched.
  const lobbyList = useDebateLobbies(true, { staleTime: LOBBY_LIST_STALE_MS });

  const rows = requests.data?.requests;

  const answerable = useOpenScheduledRequests(rows);

  const roomList = React.useMemo(() => rooms.data?.rooms ?? [], [rooms.data]);
  const finishedRoomIds = useFinishedRoomIds(roomList);

  const upcoming = React.useMemo(
    () =>
      roomList
        // Lobbies share the list and get their own section.
        .filter(room => room.kind !== 'lobby' && !finishedRoomIds.has(room.room_id))
        .map(room => {
          const request = requestForRoom(rows, room.room_id);
          return {
            room,
            opponentUserId: opponentOf(request, viewerId),
            scheduledEndAt: request?.scheduled_end_at ?? null,
            requestId: request?.status === 'accepted' ? request.request_id : null,
          };
        }),
    [finishedRoomIds, roomList, rows, viewerId]
  );

  const lobbies = React.useMemo(
    () => upcomingLobbyRows(roomList, lobbyList.data?.lobbies ?? [], viewerId),
    [lobbyList.data, roomList, viewerId]
  );

  // The viewer included: their own side of the strip needs a face too.
  const participantIds = React.useMemo(
    () => (rows ?? []).flatMap(request => request.participants.map(participant => participant.user_id)),
    [rows]
  );
  const people = useGeoChatUserSummaries(participantIds, true);

  return {
    answerable,
    upcoming,
    lobbies,
    people,
    requestsError: requests.error ?? null,
    roomsError: rooms.error ?? null,
    lobbiesError: lobbyList.error ?? null,
    loading: Boolean(requests.isLoading || rooms.isLoading || lobbyList.isLoading),
  };
}

const LOBBY_LIST_STALE_MS = 30_000;

/**
 * Names come from the graph, since a geo-chat user id is their personal space's page entity. The
 * roster is only a fallback while that loads: it covers people who are online, and whoever invited
 * you usually is not.
 */
export function useParticipantLookup(enabled: boolean, requestPeople: DebateParticipantSummary[]) {
  const roster = useDebatePeople(enabled);

  return React.useMemo(() => {
    const byId = new Map<string, DebateParticipantSummary>();
    for (const person of roster.data?.people ?? []) byId.set(normId(person.user_id), person);
    // The graph's record wins, field by field: where it has no name or face, the roster's stays.
    // `||` rather than `??`, because an empty name is as missing as a null one — `speakerLabel`
    // reads it that way too.
    for (const person of requestPeople) {
      const key = normId(person.user_id);
      const online = byId.get(key);
      byId.set(key, {
        ...person,
        display_name: person.display_name || online?.display_name || null,
        avatar_cid: person.avatar_cid || online?.avatar_cid || null,
      });
    }
    return (userId: string | null) => (userId ? (byId.get(normId(userId)) ?? null) : null);
  }, [requestPeople, roster.data]);
}

/** An open room says so and offers the way in; one that is not yet open says when. */
function UpcomingRow({
  room,
  requestId,
  scheduledEndAt,
  opponent,
  viewer,
  onReschedule,
}: {
  room: UpcomingDebateRoom;
  requestId: string | null;
  scheduledEndAt: string | null;
  opponent: DebateParticipantSummary | null;
  viewer: DebateParticipantSummary | null;
  /** Opens the other debater's week to move this debate. Null when it cannot be offered. */
  onReschedule: ((opener: HTMLElement) => void) | null;
}) {
  return (
    <ScheduleCard
      parties={<DebateParties viewer={viewer} opponent={opponent} />}
      when={
        room.due
          ? `Starting now${scheduledEndAt ? ` · Ends at ${formatTime(scheduledEndAt)}` : ''}`
          : scheduledEndAt
            ? formatDebateSlot(room.starts_at, scheduledEndAt)
            : formatDebateTime(room.starts_at)
      }
      status={roomStatusLabel(room, opponent)}
      urgent={room.others_present}
      actions={
        <BookedDebateActions room={room} requestId={requestId} opponent={opponent} onReschedule={onReschedule} />
      }
    />
  );
}

export function ScheduledRow({
  request,
  opponent,
  viewer,
  viewerId,
  busy,
  onAnswer,
  onReschedule,
  ref,
  analyticsSurface = 'hub',
}: {
  /** From `HubCardList`, whose `popLayout` measures the card on its way out. */
  ref?: React.Ref<HTMLElement>;
  analyticsSurface?: DebateAnalyticsSurface;
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  viewer: DebateParticipantSummary | null;
  viewerId: string | null;
  busy: boolean;
  onAnswer: ScheduledDebateAnswer;
  /** Opens the other debater's week to propose a new time for this request. Null when they are not known. */
  onReschedule: ((opener: HTMLElement) => void) | null;
}) {
  const expiry = useScheduledExpiry(request.scheduled_start_at);
  const { viewerAccepted } = scheduledRequestRoles(request, viewerId);
  return (
    <ScheduleCard
      ref={ref}
      parties={<DebateParties viewer={viewer} opponent={opponent} />}
      when={formatDebateSlot(request.scheduled_start_at, request.scheduled_end_at)}
      status={`${
        request.viewer_must_answer
          ? 'Waiting on your answer'
          : viewerAccepted
            ? `Not confirmed until ${opponentName(opponent)} answers`
            : 'Waiting on their answer'
      } · ${expiry}`}
      note={adminArrangedNote(request, opponent, viewerId)}
      actions={
        request.viewer_must_answer ? (
          <ScheduledAnswerButtons
            key={`${request.scheduled_start_at}:${request.reschedule_count}`}
            requestId={request.request_id}
            busy={busy}
            onAnswer={onAnswer}
            onReschedule={onReschedule}
            analyticsSurface={analyticsSurface}
          />
        ) : (
          <WaitingInviteActions
            request={request}
            opponent={opponent}
            viewerId={viewerId}
            onReschedule={onReschedule}
            analyticsSurface={analyticsSurface}
          />
        )
      }
    />
  );
}

/**
 * The line the Requests timeline's actions sit on (GEO-3463), its pills sized to their words.
 * Nothing at all when every action on it has stepped aside, such as Cancel for its confirm step.
 */
export function CompactActionRow({ children }: { children: React.ReactNode }) {
  if (React.Children.toArray(children).length === 0) return null;
  return <div className="flex flex-nowrap items-center gap-1.5">{children}</div>;
}

/**
 * A booked debate's actions: Join once the room opens, and Reschedule or Cancel until anyone has been
 * in it. The section's card stacks them full width. `compact` is the panel's timeline (GEO-3463): one
 * line, where Join holds its place, dimmed, until the room opens, and Cancel's confirm step opens
 * under the line rather than squeezing into it.
 */
export function BookedDebateActions({
  room,
  requestId,
  opponent,
  onReschedule,
  compact = false,
}: {
  room: UpcomingDebateRoom;
  requestId: string | null;
  opponent: DebateParticipantSummary | null;
  /** Opens the other debater's week to move this debate. Null when it cannot be offered. */
  onReschedule: ((opener: HTMLElement) => void) | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const roomPath = debateRoomPath(room.room_id);
  const cancellable = roomCancellable({ room, requestId });
  const cancel = useCancelScheduled({ requestId: cancellable ? requestId : null, kind: 'debate', opponent, compact });

  const join = room.joinable ? (
    <Link
      href={roomPath}
      onClick={debateEntryClick(() => router.push(roomPath))}
      className={compact ? hubPillClassName('primary', undefined, 'compact') : JOIN_PILL}
      {...hubAnalyticsAttributes('Join scheduled debate', 'join_scheduled_debate')}
    >
      {compact ? 'Join' : 'Join debate'}
    </Link>
  ) : compact ? (
    <span aria-disabled className={hubPillClassName('secondary', 'opacity-40', 'compact')}>
      Join
    </span>
  ) : null;
  // Moving it is refused on exactly the same rule, and needs the other debater's week.
  const reschedule =
    cancellable && onReschedule ? (
      <HubPillButton
        className={compact ? undefined : 'w-full'}
        size={compact ? 'compact' : 'default'}
        analyticsLabel="Debate hub Reschedule scheduled debate"
        analyticsIntent="reschedule_scheduled_debate"
        onClick={event => onReschedule(event.currentTarget)}
      >
        Reschedule
      </HubPillButton>
    ) : null;

  if (compact) {
    return (
      <>
        <CompactActionRow>
          {join}
          {reschedule}
          {cancel.button}
        </CompactActionRow>
        {cancel.panel}
      </>
    );
  }
  if (!room.joinable && !cancellable) return null;
  return (
    <div className="flex flex-col gap-2">
      {join}
      {reschedule}
      {cancel.button}
      {cancel.panel}
    </div>
  );
}

/**
 * An invite waiting on the other debater, from a viewer who may still withdraw it: Reschedule once
 * they have accepted it, and Cancel. Nothing for one they may not. `compact` as on
 * {@link BookedDebateActions}.
 */
export function WaitingInviteActions({
  request,
  opponent,
  viewerId,
  onReschedule,
  analyticsSurface = 'hub',
  compact = false,
}: {
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  viewerId: string | null;
  onReschedule: ((opener: HTMLElement) => void) | null;
  analyticsSurface?: DebateAnalyticsSurface;
  compact?: boolean;
}) {
  const { proposedByViewer, viewerAccepted, withdrawable } = scheduledRequestRoles(request, viewerId);
  const cancel = useCancelScheduled({
    requestId: withdrawable ? request.request_id : null,
    kind: proposedByViewer ? 'request' : 'debate',
    opponent,
    analyticsSurface,
    compact,
  });
  if (!withdrawable) return null;

  const reschedule =
    viewerAccepted && onReschedule ? (
      <HubPillButton
        className={compact ? undefined : 'w-full'}
        size={compact ? 'compact' : 'default'}
        analyticsSurface={analyticsSurface}
        analyticsLabel={debateAnalyticsLabel(analyticsSurface, 'Reschedule scheduled request')}
        analyticsIntent="reschedule_scheduled_request"
        onClick={event => onReschedule(event.currentTarget)}
      >
        Reschedule
      </HubPillButton>
    ) : null;

  if (compact) {
    return (
      <>
        <CompactActionRow>
          {reschedule}
          {cancel.button}
        </CompactActionRow>
        {cancel.panel}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {reschedule}
      {cancel.button}
      {cancel.panel}
    </div>
  );
}

/**
 * One answer per request version, including taps before the mutation's pending render. Key it on the
 * request's time and reschedule count, so a moved request can be answered again.
 *
 * `inline` is the panel's schedule (GEO-3463): one line, primary first — Accept · Decline · Suggest a
 * time. The analytics labels are the same in both layouts, so the two read as one series.
 */
export function ScheduledAnswerButtons({
  requestId,
  busy,
  onAnswer,
  onReschedule,
  analyticsSurface,
  layout = 'stacked',
}: {
  requestId: string;
  busy: boolean;
  onAnswer: ScheduledDebateAnswer;
  onReschedule: ((opener: HTMLElement) => void) | null;
  analyticsSurface: DebateAnalyticsSurface;
  layout?: 'stacked' | 'inline';
}) {
  const { answerOnce, releaseAnswer } = useAnswerOnce();
  const inline = layout === 'inline';
  const size = inline ? 'compact' : 'default';

  // Labelled apart from the instant request cards' Accept and Decline, which would otherwise share
  // their labels and could not be told from these in the data.
  const accept = (
    <HubPillButton
      variant="primary"
      size={size}
      analyticsSurface={analyticsSurface}
      analyticsLabel={debateAnalyticsLabel(analyticsSurface, 'Accept scheduled debate')}
      analyticsIntent="accept_scheduled_debate"
      onClick={() => answerOnce(() => onAnswer(requestId, true, releaseAnswer.onError))}
      disabled={busy}
    >
      Accept
    </HubPillButton>
  );
  const decline = (
    <HubPillButton
      size={size}
      analyticsSurface={analyticsSurface}
      analyticsLabel={debateAnalyticsLabel(analyticsSurface, 'Decline scheduled debate')}
      analyticsIntent="decline_scheduled_debate"
      onClick={() => answerOnce(() => onAnswer(requestId, false, releaseAnswer.onError))}
      disabled={busy}
    >
      Decline
    </HubPillButton>
  );
  // The scheduling email's third answer (GEO-3232): a time that does not suit is moved, and the
  // other side asked again, rather than declined. The timeline's line has room for fewer words.
  const newTime = onReschedule ? (
    <HubPillButton
      size={size}
      className={inline ? undefined : 'col-span-2'}
      analyticsSurface={analyticsSurface}
      analyticsLabel={debateAnalyticsLabel(analyticsSurface, 'Choose different time for scheduled request')}
      analyticsIntent="choose_different_time_scheduled_request"
      onClick={event => onReschedule(event.currentTarget)}
      disabled={busy}
    >
      {inline ? 'Suggest a time' : 'Choose different time'}
    </HubPillButton>
  ) : null;

  if (inline) {
    return (
      <CompactActionRow>
        {accept}
        {decline}
        {newTime}
      </CompactActionRow>
    );
  }
  return (
    // Decline first, Accept primary on the right: the order every other request card uses, with
    // the new time under them in the email's words.
    <div className="grid grid-cols-2 gap-2">
      {decline}
      {accept}
      {newTime}
    </div>
  );
}

/**
 * GEO-3229: a match the Geo team arranged says so on the card for as long as it is pending, including
 * after one debater has accepted, so it never reads as the other debater having asked. Once a time
 * has been moved, it also says which debater proposed the new one. Null for a request between people.
 */
export function adminArrangedNote(
  request: ScheduledDebateRequest,
  opponent: DebateParticipantSummary | null,
  viewerId: string | null
): string | null {
  if (!request.created_by_admin) return null;
  const arranged = 'Arranged by the Geo team';
  const proposer = request.proposed_by_user_id;
  if (request.reschedule_count === 0 || proposer === null) return arranged;
  if (viewerId !== null && sameId(proposer, viewerId)) return `${arranged} · You proposed this time`;
  return `${arranged} · ${opponentName(opponent)} proposed this time`;
}

const CANCEL_COPY = {
  debate: {
    action: 'Cancel debate',
    question: (name: string) => `Cancel your debate with ${name}? The time is freed up for both of you.`,
    analytics: ['Cancel scheduled debate', 'cancel_scheduled_debate'],
  },
  request: {
    action: 'Cancel request',
    question: (name: string) => `Cancel your request to ${name}?`,
    analytics: ['Cancel scheduled request', 'cancel_scheduled_request'],
  },
} as const;

/**
 * Calling a scheduled debate off (GEO-3093), behind a confirm step: an accepted debate is an
 * agreement with someone else, and one press should not be able to undo it.
 */
export function CancelScheduled(props: CancelScheduledOptions & { requestId: string }) {
  const { button, panel } = useCancelScheduled(props);
  return (
    <div className="flex flex-col gap-2">
      {button}
      {panel}
    </div>
  );
}

type CancelScheduledOptions = {
  /** Null when there is nothing the viewer may cancel; both parts are then empty. */
  requestId: string | null;
  kind: keyof typeof CANCEL_COPY;
  opponent: DebateParticipantSummary | null;
  analyticsSurface?: DebateAnalyticsSurface;
  /**
   * The Requests timeline's one-line actions (GEO-3463): the pill sizes to its label rather than the
   * card, and the confirm step keeps its two buttons on one line under the question.
   */
  compact?: boolean;
};

/**
 * Cancel in two parts, for a layout that puts them in different places: the `button` that starts
 * it, and the `panel` for everything after the press — the confirm step, a refusal, "Cancelled".
 * The timeline keeps the button in its one-line row and opens the panel under it; the card stacks
 * the two. The button steps aside while the panel asks.
 */
function useCancelScheduled({
  requestId,
  kind,
  opponent,
  analyticsSurface = 'hub',
  compact = false,
}: CancelScheduledOptions): { button: React.ReactNode; panel: React.ReactNode } {
  const cancel = useCancelScheduledDebate();
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const copy = CANCEL_COPY[kind];
  const [label, intent] = copy.analytics;
  const size = compact ? 'compact' : 'default';

  if (requestId === null) return { button: null, panel: null };

  // Gone from the list once the refetch lands; until then the card must not offer it again.
  if (cancel.isSuccess) {
    return {
      button: null,
      panel: (
        <Text as="p" variant="footnote" color="grey-04">
          Cancelled
        </Text>
      ),
    };
  }

  if (!confirming) {
    return {
      button: (
        <HubPillButton
          className={compact ? undefined : 'w-full'}
          size={size}
          analyticsSurface={analyticsSurface}
          analyticsLabel={debateAnalyticsLabel(analyticsSurface, label)}
          analyticsIntent={intent}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          {compact ? 'Cancel' : copy.action}
        </HubPillButton>
      ),
      panel: error ? (
        <Text as="p" variant="footnote" color="red-01">
          {error}
        </Text>
      ) : null,
    };
  }

  return {
    button: null,
    panel: (
      <div className="flex flex-col gap-2">
        <Text as="p" variant="footnote">
          {copy.question(opponentName(opponent))}
        </Text>
        <div className={compact ? 'flex flex-nowrap gap-1.5' : 'grid grid-cols-2 gap-2'}>
          <HubPillButton
            size={size}
            analyticsSurface={analyticsSurface}
            analyticsLabel={debateAnalyticsLabel(analyticsSurface, `Keep ${kind}`)}
            analyticsIntent={`keep_scheduled_${kind}`}
            onClick={() => setConfirming(false)}
            disabled={cancel.isPending}
          >
            Keep it
          </HubPillButton>
          <HubPillButton
            variant="primary"
            size={size}
            analyticsSurface={analyticsSurface}
            analyticsLabel={debateAnalyticsLabel(analyticsSurface, `Confirm ${label}`)}
            analyticsIntent={`confirm_${intent}`}
            pending={cancel.isPending}
            pendingLabel="Cancelling…"
            onClick={() =>
              cancel.mutate(
                { requestId },
                {
                  onError: failure => {
                    setConfirming(false);
                    setError(cancelFailureMessage(failure));
                  },
                }
              )
            }
          >
            {copy.action}
          </HubPillButton>
        </div>
      </div>
    ),
  };
}

/**
 * When an unanswered request lapses: at its start. Counted down in the final hour, where the
 * instant cards' "Expires in 12m" reads naturally; before that, a minute count days long would not.
 */
function useScheduledExpiry(startIso: string) {
  const countdown = useRequestCountdown(startIso);
  return countdown.remainingMs <= HOUR_MS ? countdown.label : 'Expires at start';
}

const HOUR_MS = 60 * 60_000;

/** The hub's pill, as a full-width link. `HubPillButton` renders a button, which this cannot be. */
const JOIN_PILL = hubPillClassName('primary', 'w-full');

/**
 * One shape for every card here, laid out like the instant request card: a header carrying the
 * time and where things stand, who it is with in an inset strip, then the actions.
 *
 * The time leads because it is what a scheduled request is *about* — the one thing an instant
 * request never has — so it gets the header to itself rather than a footnote under the name.
 */
function ScheduleCard({
  parties,
  when,
  status,
  note = null,
  urgent = false,
  actions,
  ref,
  testId,
}: {
  ref?: React.Ref<HTMLElement>;
  /** Who it is with: the "You vs Them" strip for a debate, the lobby's name and host for a lobby. */
  parties: React.ReactNode;
  testId?: string;
  when: string;
  status: string;
  /** A second line under the status, e.g. that the Geo team arranged the debate. */
  note?: string | null;
  urgent?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
      data-testid={testId}
    >
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
          {note && (
            <Text as="span" variant="footnote" color="grey-04">
              {note}
            </Text>
          )}
        </div>
      </div>

      {parties}

      {actions}
    </motion.article>
  );
}

/**
 * The same "You vs Them" strip every other request card uses. No positions: a scheduled debate is
 * not about a claim yet, so there is no side to show.
 */
function DebateParties({
  viewer,
  opponent,
}: {
  viewer: DebateParticipantSummary | null;
  opponent: DebateParticipantSummary | null;
}) {
  return <RequestParties viewer={viewer} opponent={opponent ?? UNKNOWN_OPPONENT} showPositions={false} />;
}

/**
 * A lobby under Upcoming lobbies (GEO-3292): a scheduled debate's header, with the lobby's name and
 * host where a debate has its strip.
 */
function UpcomingLobbyRowCard({ row }: { row: UpcomingLobbyRow }) {
  // From the clock, not from the reads: an empty lobby sends nothing when its start passes.
  const now = useMinuteNow();
  const hostLine = lobbyHostLine(row);

  return (
    <ScheduleCard
      testId="upcoming-lobby-card"
      when={Date.parse(row.startsAt) <= now ? 'Starting now' : formatDebateTime(row.startsAt)}
      status={row.open ? 'The lobby is open' : `Opens at ${formatTime(row.opensAt)}`}
      parties={
        <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-grey-01 px-3 py-2.5">
          <Text as="span" variant="footnoteMedium" color="grey-04">
            Debate lobby
          </Text>
          <Text as="p" variant="metadataMedium" className="truncate">
            {row.name}
          </Text>
          {hostLine && (
            <Text as="p" variant="footnote" color="grey-04" className="truncate">
              {hostLine}
            </Text>
          )}
        </div>
      }
      actions={<LobbyRowAction row={row} />}
    />
  );
}

/**
 * A lobby row's one button: View before it opens, then Join, or Open for someone already on its
 * roster. Lobby to lobby, like the side panel card's links: marked so the join it leads to is
 * attributed to Requests, with no step-out, which is for entering a 1:1. `compact` is the panel's
 * timeline (GEO-3463), where the pill says only the verb; its clicks read the same as the card's.
 */
export function LobbyRowAction({ row, compact = false }: { row: UpcomingLobbyRow; compact?: boolean }) {
  const action = LOBBY_ACTIONS[row.open ? (row.onRoster ? 'open' : 'join') : 'view'];
  const primary = row.open && !row.onRoster;
  return (
    <Link
      href={debateRoomPath(row.lobbyId)}
      onClick={() => markLobbyEntry(row.lobbyId, 'requests')}
      className={
        compact
          ? hubPillClassName(primary ? 'primary' : 'secondary', undefined, 'compact')
          : primary
            ? JOIN_PILL
            : hubPillClassName('secondary', 'w-full')
      }
      {...hubAnalyticsAttributes(action.analyticsLabel, action.analyticsIntent)}
    >
      {compact ? action.verb : action.label}
    </Link>
  );
}

/** A lobby row's button: its words, the verb alone for the timeline, and its analytics label and intent. */
const LOBBY_ACTIONS = {
  view: {
    label: 'View lobby',
    verb: 'View',
    analyticsLabel: 'View scheduled lobby',
    analyticsIntent: 'view_scheduled_lobby',
  },
  join: {
    label: 'Join lobby',
    verb: 'Join',
    analyticsLabel: 'Join scheduled lobby',
    analyticsIntent: 'join_scheduled_lobby',
  },
  open: {
    label: 'Open lobby',
    verb: 'Open',
    analyticsLabel: 'Open scheduled lobby',
    analyticsIntent: 'open_scheduled_lobby',
  },
} as const;

/** Stands in until the graph or roster names them; its empty space id keeps it unlinked. */
const UNKNOWN_OPPONENT: DebateParticipantSummary = {
  user_id: '',
  profile_space_id: '',
  display_name: UNNAMED_OPPONENT,
  avatar_cid: null,
};

function ReadFailed({ children }: { children: React.ReactNode }) {
  return (
    <Text as="p" variant="footnote" color="red-01">
      {children}
    </Text>
  );
}
