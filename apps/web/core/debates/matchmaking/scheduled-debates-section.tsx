'use client';

import * as React from 'react';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  type DebateParticipantSummary,
  GeoChatRequestError,
  type ScheduledDebateRequest,
  type UpcomingDebateRoom,
} from '~/core/debates/api';
import { debateEntryClick } from '~/core/debates/lobbies/step-out';
import { useFinishedRoomIds, useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { UNNAMED_OPPONENT } from '~/core/debates/rooms/room-copy';
import { opponentName, opponentOf, requestForRoom } from '~/core/debates/rooms/room-opponent';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { useOpenScheduledRequests } from '~/core/debates/rooms/scheduled-awaiting';
import {
  useCancelScheduledDebate,
  useRespondToScheduledDebate,
  useScheduledDebates,
} from '~/core/debates/rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { normId } from '~/core/utils/norm-id';

import { Date as DateIcon } from '~/design-system/icons/date';
import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import { useDebatePeople } from './hooks';
import { hubAnalyticsAttributes } from './hub-analytics';
import { HubCardList, hubCardMotion } from './hub-motion';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import { RequestParties } from './request-parties';
import { RequestSection } from './request-section';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { useRequestCountdown } from './use-request-countdown';

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
  // The debate whose time is being moved, on the other debater's week. One at a time, so the modal
  // lives here rather than per row, and closing it hands focus back to the row's button.
  const [rescheduling, setRescheduling] = React.useState<Rescheduling | null>(null);
  const rescheduleOpenerRef = React.useRef<HTMLElement | null>(null);

  // The strip's left-hand side. Resolved like anyone else, so it carries the viewer's own face.
  const viewer = lookUp(viewerId);

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
        <RequestSection label="Upcoming debates">
          {upcoming.map(({ room, opponentUserId, scheduledEndAt, requestId }) => (
            <UpcomingRow
              key={room.room_id}
              room={room}
              requestId={requestId}
              scheduledEndAt={scheduledEndAt}
              opponent={lookUp(opponentUserId)}
              viewer={viewer}
              onReschedule={
                requestId && opponentUserId
                  ? opener => {
                      rescheduleOpenerRef.current = opener;
                      setRescheduling({
                        requestId,
                        opponentUserId,
                        opponentName: lookUp(opponentUserId)?.display_name ?? null,
                      });
                    }
                  : null
              }
            />
          ))}
          {roomsError && <ReadFailed>Could not read your upcoming debates: {roomsError.message}</ReadFailed>}
        </RequestSection>
      )}

      {(answerable.length > 0 || requestsError) && (
        <RequestSection label="Scheduled">
          {requestsError && <ReadFailed>Could not read your scheduled debates: {requestsError.message}</ReadFailed>}
          {/* The instant cards' list, so one that expires folds away the way theirs do. */}
          <HubCardList>
            {answerable.map(request => (
              <ScheduledRow
                key={request.request_id}
                request={request}
                opponent={lookUp(opponentOf(request, viewerId))}
                viewer={viewer}
                viewerId={viewerId}
                busy={respond.isPending}
                onAnswer={answer}
              />
            ))}
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
      <PeerAvailabilityBookingModal
        open={rescheduling !== null}
        userId={rescheduling?.opponentUserId ?? ''}
        peerName={rescheduling?.opponentName}
        rescheduleRequestId={rescheduling?.requestId ?? null}
        entry="requests_reschedule"
        openerRef={rescheduleOpenerRef}
        onClose={() => setRescheduling(null)}
      />
    </>
  );
}

/** An accepted debate being moved: whose week to open, and the request it moves. */
type Rescheduling = { requestId: string; opponentUserId: string; opponentName: string | null };

/**
 * What this tab has to show. Shared with the tab itself, which needs it for its empty state; both
 * reads hit the same query keys, so asking twice costs one request.
 */
export type ScheduledContent = {
  answerable: ScheduledDebateRequest[];
  upcoming: UpcomingRoomRow[];
  /** Who the requests' participants are, resolved from the graph. Empty until that lands. */
  people: DebateParticipantSummary[];
  /** Kept apart: one read failing must not hide what the other returned. */
  requestsError: Error | null;
  roomsError: Error | null;
};

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

  const rows = requests.data?.requests;

  const answerable = useOpenScheduledRequests(rows);

  const roomList = React.useMemo(() => rooms.data?.rooms ?? [], [rooms.data]);
  const finishedRoomIds = useFinishedRoomIds(roomList);

  const upcoming = React.useMemo(
    () =>
      roomList
        // Reminded lobbies share the list but are not scheduled debates (GEO-3133).
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

  // The viewer included: their own side of the strip needs a face too.
  const participantIds = React.useMemo(
    () => (rows ?? []).flatMap(request => request.participants.map(participant => participant.user_id)),
    [rows]
  );
  const people = useGeoChatUserSummaries(participantIds, true);

  return { answerable, upcoming, people, requestsError: requests.error ?? null, roomsError: rooms.error ?? null };
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
  // geo-chat refuses once anyone has joined (`debate_already_started`), so the button goes first.
  // The room's session is created on first join, so a non-null one means someone has been in even
  // if they have since left and `others_present` no longer says so.
  const cancellable = requestId !== null && !room.others_present && !room.rematch_session_id;
  const router = useRouter();
  const roomPath = debateRoomPath(room.room_id);

  return (
    <ScheduleCard
      opponent={opponent}
      viewer={viewer}
      when={
        room.due
          ? `Starting now${scheduledEndAt ? ` · Ends at ${formatTime(scheduledEndAt)}` : ''}`
          : scheduledEndAt
            ? formatDebateSlot(room.starts_at, scheduledEndAt)
            : formatDebateTime(room.starts_at)
      }
      status={
        room.others_present
          ? `${opponentName(opponent)} is waiting for you now`
          : room.joinable
            ? 'The room is open'
            : `Opens at ${formatTime(room.opens_at)}`
      }
      urgent={room.others_present}
      actions={
        (room.joinable || cancellable) && (
          <div className="flex flex-col gap-2">
            {room.joinable && (
              <Link
                href={roomPath}
                onClick={debateEntryClick(() => router.push(roomPath))}
                className={JOIN_PILL}
                {...hubAnalyticsAttributes('Join scheduled debate', 'join_scheduled_debate')}
              >
                Join debate
              </Link>
            )}
            {/* Moving it is refused on exactly the same rule, and needs the other debater's week. */}
            {cancellable && onReschedule && (
              <HubPillButton
                className="w-full"
                analyticsLabel="Debate hub Reschedule scheduled debate"
                analyticsIntent="reschedule_scheduled_debate"
                onClick={event => onReschedule(event.currentTarget)}
              >
                Reschedule
              </HubPillButton>
            )}
            {cancellable && <CancelScheduled requestId={requestId} kind="debate" opponent={opponent} />}
          </div>
        )
      }
    />
  );
}

function ScheduledRow({
  request,
  opponent,
  viewer,
  viewerId,
  busy,
  onAnswer,
  ref,
}: {
  /** From `HubCardList`, whose `popLayout` measures the card on its way out. */
  ref?: React.Ref<HTMLElement>;
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  viewer: DebateParticipantSummary | null;
  viewerId: string | null;
  busy: boolean;
  onAnswer: (requestId: string, accepted: boolean) => void;
}) {
  const expiry = useScheduledExpiry(request.scheduled_start_at);
  // While pending, only whoever proposed the current time may withdraw it; the other side declines.
  const withdrawable =
    !request.viewer_must_answer &&
    viewerId !== null &&
    request.proposed_by_user_id !== null &&
    sameId(request.proposed_by_user_id, viewerId);

  return (
    <ScheduleCard
      ref={ref}
      opponent={opponent}
      viewer={viewer}
      when={formatDebateSlot(request.scheduled_start_at, request.scheduled_end_at)}
      status={`${request.viewer_must_answer ? 'Waiting on your answer' : 'Waiting on their answer'} · ${expiry}`}
      actions={
        request.viewer_must_answer ? (
          // Decline first, Accept primary on the right: the order every other request card uses.
          <div className="grid grid-cols-2 gap-2">
            {/* Labelled apart from the instant request cards' Accept and Decline, which would
                otherwise share their labels and could not be told from these in the data. */}
            <HubPillButton
              analyticsLabel="Debate hub Decline scheduled debate"
              analyticsIntent="decline_scheduled_debate"
              onClick={() => onAnswer(request.request_id, false)}
              disabled={busy}
            >
              Decline
            </HubPillButton>
            <HubPillButton
              variant="primary"
              analyticsLabel="Debate hub Accept scheduled debate"
              analyticsIntent="accept_scheduled_debate"
              onClick={() => onAnswer(request.request_id, true)}
              disabled={busy}
            >
              Accept
            </HubPillButton>
          </div>
        ) : (
          withdrawable && <CancelScheduled requestId={request.request_id} kind="request" opponent={opponent} />
        )
      }
    />
  );
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
function CancelScheduled({
  requestId,
  kind,
  opponent,
}: {
  requestId: string;
  kind: keyof typeof CANCEL_COPY;
  opponent: DebateParticipantSummary | null;
}) {
  const cancel = useCancelScheduledDebate();
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const copy = CANCEL_COPY[kind];
  const [label, intent] = copy.analytics;

  // Gone from the list once the refetch lands; until then the card must not offer it again.
  if (cancel.isSuccess) {
    return (
      <Text as="p" variant="footnote" color="grey-04">
        Cancelled
      </Text>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <HubPillButton
          className="w-full"
          analyticsLabel={`Debate hub ${label}`}
          analyticsIntent={intent}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          {copy.action}
        </HubPillButton>
        {error && (
          <Text as="p" variant="footnote" color="red-01">
            {error}
          </Text>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Text as="p" variant="footnote">
        {copy.question(opponentName(opponent))}
      </Text>
      <div className="grid grid-cols-2 gap-2">
        <HubPillButton
          analyticsLabel={`Debate hub Keep ${kind}`}
          analyticsIntent={`keep_scheduled_${kind}`}
          onClick={() => setConfirming(false)}
          disabled={cancel.isPending}
        >
          Keep it
        </HubPillButton>
        <HubPillButton
          variant="primary"
          analyticsLabel={`Debate hub Confirm ${label}`}
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
  );
}

/** geo-chat's two refusals, said plainly; anything else keeps its own message. */
export function cancelFailureMessage(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'debate_already_started') {
      return 'Someone has already joined this debate, so it can no longer be cancelled.';
    }
    if (error.code === 'request_not_cancellable') return 'This has already been answered, cancelled or expired.';
  }
  return error instanceof Error ? error.message : 'Could not cancel. Try again.';
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
 * One shape for both kinds of card, laid out like the instant request card: a header carrying the
 * time and where things stand, the other debater in the same inset strip the request cards use,
 * then the actions.
 *
 * The time leads because it is what a scheduled request is *about* — the one thing an instant
 * request never has — so it gets the header to itself rather than a footnote under the name.
 */
function ScheduleCard({
  opponent,
  viewer,
  when,
  status,
  urgent = false,
  actions,
  ref,
}: {
  ref?: React.Ref<HTMLElement>;
  opponent: DebateParticipantSummary | null;
  viewer: DebateParticipantSummary | null;
  when: string;
  status: string;
  urgent?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
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
        </div>
      </div>

      {/* The same "You vs Them" strip every other request card uses. No positions: a scheduled
          debate is not about a claim yet, so there is no side to show. */}
      <RequestParties viewer={viewer} opponent={opponent ?? UNKNOWN_OPPONENT} showPositions={false} />

      {actions}
    </motion.article>
  );
}

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
