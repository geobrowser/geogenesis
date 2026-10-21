'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { RUNNING_LATE_MINUTES, type RunningLateMinutes, type UpcomingDebateRoom } from '~/core/debates/api';
import { toDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { debateEntryClick } from '~/core/debates/lobbies/step-out';
import { useMinuteNow } from '~/core/debates/lobbies/use-minute-now';
import { debateActionAnalyticsAttributes, debateAnalyticsLabel } from '~/core/debates/matchmaking/hub-analytics';
import { HubPillButton, hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';
import { useGeoChatUserSummaries } from '~/core/debates/matchmaking/use-geo-chat-user-summaries';
import { useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { SCHEDULED_NOTICE_COPY as COPY } from '~/core/debates/rooms/room-copy';
import { opponentName, requestById, useRequestOpponent } from '~/core/debates/rooms/room-opponent';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import { formatClockTime, startOffset } from '~/core/debates/rooms/room-time';
import {
  DEFAULT_LATE_MINUTES,
  NOTICE_NOTE_MAX,
  type ScheduledNoticeStep,
  noticeNote,
  noticeRequestState,
} from '~/core/debates/rooms/scheduled-notice';
import { useCantMakeIt, useReportRunningLate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';
import { noticeFailureMessage } from '~/core/debates/rooms/scheduling-refusals';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';

import { Text } from '~/design-system/text';

import { Notice } from '~/partials/availability/peer-availability';
import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';
import { ScheduleDialog } from '~/partials/availability/schedule-dialog';

/** Analytics for a link or quiet button on this dialog, on the scheduling surfaces' label scheme. */
function analytics(action: string, intent: string) {
  return debateActionAnalyticsAttributes('scheduled-notice', action, intent);
}

/** The same, as `HubPillButton` takes it. */
function pill(action: string, intent: string) {
  return { analyticsLabel: debateAnalyticsLabel('scheduled-notice', action), analyticsIntent: intent };
}

/**
 * What happened, held by the dialog rather than the step. The request list refetches on success, and
 * reading it then would replace the confirmation with "This debate is no longer on."
 */
type Outcome = { message: string; joinRoomId: string | null };

type Props = {
  open: boolean;
  /** The scheduled request, as a link names it (dashed) or geo-chat lists it (dashless). */
  requestId: string;
  initialStep: ScheduledNoticeStep;
  onClose: () => void;
  /**
   * Board 2's "Reschedule instead". Only the reschedule link offers it, and it owns the week: there it
   * swaps this dialog for the calendar the link would otherwise have opened.
   */
  onReschedule?: () => void;
  /** Drawn in place of the step, for a viewer who has to sign in first. */
  children?: React.ReactNode;
};

/**
 * Running late and Can't make it (GEO-3427, boards 1b, 2 and 3): what a debater who won't be there
 * on time tells the other one. Reached from a scheduling email's buttons, the calendar invite, and
 * the reschedule link once the room is open. In the frame the other scheduling dialogs share.
 *
 * Nothing is sent until a confirm press. A link only opens this, because mail scanners open links.
 */
export function ScheduledDebateNoticeDialog({ open, requestId, initialStep, onClose, onReschedule, children }: Props) {
  const [step, setStep] = React.useState<ScheduledNoticeStep>(initialStep);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  // Can't make it's "Suggest another time" hands over to the week, carrying the note.
  const [suggesting, setSuggesting] = React.useState<{ note: string | undefined } | null>(null);

  const { authenticated } = useGeoChatAuth();
  const requests = useScheduledDebates(open && authenticated);
  const rooms = useUpcomingDebateRooms(open && authenticated);
  const request = requestById(requests.data?.requests, requestId);
  const opponent = useRequestOpponent(request);
  const name = opponentName(opponent);
  const roomId = request?.room_id ?? null;
  const room = roomId ? (rooms.data?.rooms.find(row => sameId(row.room_id, roomId)) ?? null) : null;

  if (suggesting && request && opponent) {
    return (
      <PeerAvailabilityBookingModal
        open={open}
        userId={opponent.user_id}
        peerName={opponent.display_name}
        rescheduleRequestId={request.request_id}
        rescheduleNote={suggesting.note}
        entry="cant_make_it"
        onClose={onClose}
      />
    );
  }

  const shell = (title: string, body: React.ReactNode) => (
    <ScheduleDialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={title}
      widthClassName="w-[26rem]"
      closeButtonProps={analytics('Close', 'close_scheduled_notice')}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">{body}</div>
    </ScheduleDialog>
  );

  // Ahead of the request's state: once the refetch lands, the list says the debate is off, which is
  // the news this confirms rather than a reason to stop showing it.
  if (outcome) {
    return shell(
      outcome.message,
      <Actions>
        {outcome.joinRoomId && <JoinRoom roomId={outcome.joinRoomId} onJoin={onClose} label="Join the room" />}
        <HubPillButton
          size="large"
          variant={outcome.joinRoomId ? 'secondary' : 'primary'}
          className="w-full"
          onClick={onClose}
          {...pill('Done', 'close_scheduled_notice')}
        >
          {COPY.done}
        </HubPillButton>
      </Actions>
    );
  }

  if (children) return shell(COPY.title[step], children);
  if (requests.isPending) return shell(COPY.title[step], <Notice>{COPY.loading}</Notice>);
  if (requests.isError) return shell(COPY.title[step], <Notice>{COPY.state.error}</Notice>);

  const state = noticeRequestState(request);
  if (state !== 'active' || !request) {
    return shell(
      COPY.title[step],
      <Notice
        action={
          state === 'moved' && (
            <Link
              href={toDebatesPanel({ tab: 'requests' })}
              onClick={onClose}
              className={hubPillClassName('secondary', 'w-full', 'large')}
              {...analytics('Open Requests', 'open_requests_from_notice')}
            >
              {COPY.state.requests}
            </Link>
          )
        }
      >
        {COPY.state[state === 'active' ? 'missing' : state]}
      </Notice>
    );
  }

  switch (step) {
    case 'decide':
      return shell(
        COPY.title.decide,
        <DecideStep
          name={name}
          startsAt={request.scheduled_start_at}
          room={room}
          onLate={() => setStep('late')}
          onCant={() => setStep('cant')}
          onReschedule={onReschedule}
          onJoin={onClose}
        />
      );
    case 'late':
      return shell(
        COPY.late.title,
        <LateStep
          requestId={request.request_id}
          name={name}
          onCant={() => setStep('cant')}
          onSent={expectedAt =>
            setOutcome({
              message: COPY.late.sent(name, formatClockTime(expectedAt)),
              // Only into a room that is open. A late notice can be sent the day before, from the
              // calendar invite, and Join would land on "the room opens at…".
              joinRoomId: room?.joinable ? room.room_id : null,
            })
          }
        />
      );
    case 'cant':
      return shell(
        COPY.cant.title,
        <CantStep
          requestId={request.request_id}
          name={name}
          onLate={() => setStep('late')}
          onSuggest={note => setSuggesting({ note })}
          onSent={() => setOutcome({ message: COPY.cant.sent(name), joinRoomId: null })}
        />
      );
  }
}

function DecideStep({
  name,
  startsAt,
  room,
  onLate,
  onCant,
  onReschedule,
  onJoin,
}: {
  name: string;
  startsAt: string;
  room: UpcomingDebateRoom | null;
  onLate: () => void;
  onCant: () => void;
  onReschedule?: () => void;
  onJoin: () => void;
}) {
  // Re-read each minute, so "started 3 minutes ago" keeps up while the dialog is open.
  const now = useMinuteNow();

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <Text as="p" variant="mediumTitle">
          {COPY.decide.heading(name, startOffset(new Date(startsAt).getTime() - now))}
        </Text>
        {room?.others_present && (
          <span className="inline-flex items-center gap-2 rounded-full border border-grey-02 px-3 py-1.5 text-metadata">
            <span aria-hidden className="size-2 rounded-full bg-green" />
            {COPY.decide.waiting(name)}
          </span>
        )}
      </div>
      <Actions>
        {room?.joinable && <JoinRoom roomId={room.room_id} onJoin={onJoin} label="Join now" />}
        <HubPillButton size="large" className="w-full" onClick={onLate} {...pill('Running late', 'open_running_late')}>
          {COPY.decide.late}
        </HubPillButton>
        <HubPillButton size="large" className="w-full" onClick={onCant} {...pill('Cant make it', 'open_cant_make_it')}>
          {COPY.decide.cant}
        </HubPillButton>
        <Text as="p" variant="footnote" color="grey-04" className="text-center">
          {COPY.decide.explainer(name)}
        </Text>
        {onReschedule && (
          <QuietButton onClick={onReschedule} {...analytics('Reschedule instead', 'reschedule_scheduled_debate')}>
            {COPY.decide.reschedule}
          </QuietButton>
        )}
      </Actions>
    </>
  );
}

function LateStep({
  requestId,
  name,
  onCant,
  onSent,
}: {
  requestId: string;
  name: string;
  onCant: () => void;
  onSent: (expectedAt: string) => void;
}) {
  const [minutes, setMinutes] = React.useState<RunningLateMinutes>(DEFAULT_LATE_MINUTES);
  const [note, setNote] = React.useState('');
  const report = useReportRunningLate();
  const noteId = React.useId();
  const viewerId = useCurrentGeoChatUserId();
  const viewerIds = React.useMemo(() => (viewerId ? [viewerId] : []), [viewerId]);
  const viewerName = useGeoChatUserSummaries(viewerIds, viewerId !== null)[0]?.display_name || null;
  const sent = noticeNote(note);

  return (
    <>
      <Text as="p" color="grey-04">
        {COPY.late.lead(name)}
      </Text>
      <div role="radiogroup" aria-label={COPY.late.title} className="grid grid-cols-3 gap-2.5">
        {RUNNING_LATE_MINUTES.map(choice => (
          <HubPillButton
            key={choice}
            role="radio"
            aria-checked={minutes === choice}
            size="large"
            variant={minutes === choice ? 'primary' : 'secondary'}
            className="w-full rounded-xl"
            onClick={() => setMinutes(choice)}
            {...pill(`${choice} min`, 'pick_running_late_minutes')}
          >
            {COPY.late.minutes(choice)}
          </HubPillButton>
        ))}
      </div>
      <NoteField id={noteId} label={COPY.late.noteLabel(name)} value={note} onChange={setNote} />
      <div className="flex flex-col gap-1 rounded-lg bg-grey-01 p-3.5">
        <Text as="p" variant="metadataMedium">
          {COPY.late.previewLabel(name)}
        </Text>
        <Text as="p" variant="metadata" color="grey-04">
          {COPY.late.preview(viewerName, minutes, sent)}
        </Text>
      </div>
      {report.isError && <ErrorLine>{noticeFailureMessage(report.error, 'late')}</ErrorLine>}
      <Actions>
        <HubPillButton
          size="large"
          variant="primary"
          className="w-full"
          pending={report.isPending}
          pendingLabel={COPY.late.sending}
          onClick={() =>
            report.mutate({ requestId, minutes, note: sent }, { onSuccess: result => onSent(result.expected_at) })
          }
          {...pill('Tell', 'confirm_running_late')}
        >
          {COPY.late.send(name)}
        </HubPillButton>
        <QuietButton onClick={onCant} {...analytics('Cant make it at all', 'open_cant_make_it')}>
          {COPY.late.cantInstead}
        </QuietButton>
      </Actions>
    </>
  );
}

function CantStep({
  requestId,
  name,
  onLate,
  onSuggest,
  onSent,
}: {
  requestId: string;
  name: string;
  onLate: () => void;
  onSuggest: (note: string | undefined) => void;
  onSent: () => void;
}) {
  const [note, setNote] = React.useState('');
  const cancel = useCantMakeIt();
  const noteId = React.useId();

  return (
    <>
      <Text as="p" color="grey-04">
        {COPY.cant.lead(name)}
      </Text>
      <NoteField id={noteId} label={COPY.cant.noteLabel(name)} value={note} onChange={setNote} />
      {cancel.isError && <ErrorLine>{noticeFailureMessage(cancel.error, 'cant')}</ErrorLine>}
      <Actions>
        <HubPillButton
          size="large"
          variant="primary"
          className="w-full"
          pending={cancel.isPending}
          pendingLabel={COPY.cant.confirming}
          onClick={() => cancel.mutate({ requestId, note: noticeNote(note) }, { onSuccess: onSent })}
          {...pill('Cancel the debate', 'confirm_cant_make_it')}
        >
          {COPY.cant.confirm}
        </HubPillButton>
        <HubPillButton
          size="large"
          className="w-full"
          disabled={cancel.isPending}
          onClick={() => onSuggest(noticeNote(note))}
          {...pill('Suggest another time', 'suggest_time_cant_make_it')}
        >
          {COPY.cant.suggest}
        </HubPillButton>
        <Text as="p" variant="footnote" color="grey-04" className="text-center">
          {COPY.cant.suggestHint(name)}
        </Text>
        <QuietButton onClick={onLate} {...analytics('Only running late', 'open_running_late')}>
          {COPY.cant.lateInstead}
        </QuietButton>
      </Actions>
    </>
  );
}

/** The step's buttons, at the bottom of the dialog, where a thumb reaches them on a phone. */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-col gap-2.5">{children}</div>;
}

/** Into the room, stepping out of a lobby first as every way into a debate does. */
function JoinRoom({
  roomId,
  onJoin,
  label,
}: {
  roomId: string;
  onJoin: () => void;
  label: 'Join now' | 'Join the room';
}) {
  const router = useRouter();
  const path = debateRoomPath(roomId);
  return (
    <Link
      href={path}
      onClick={event => {
        debateEntryClick(() => router.push(path))(event);
        onJoin();
      }}
      className={hubPillClassName('primary', 'w-full', 'large')}
      {...analytics(label, 'join_scheduled_debate')}
    >
      {label === 'Join now' ? COPY.decide.join : COPY.late.join}
    </Link>
  );
}

/** The step's way sideways: to the other choice, or to the calendar. */
function QuietButton(props: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="self-center px-3 py-2 text-metadata text-text underline underline-offset-2 hover:opacity-70"
      {...props}
    />
  );
}

function NoteField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-metadataMedium">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={NOTICE_NOTE_MAX}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full resize-none rounded-lg border border-grey-02 p-3 text-body focus:border-text focus:outline-hidden"
      />
    </div>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert">
      <Text as="p" variant="footnote" color="red-01">
        {children}
      </Text>
    </div>
  );
}
