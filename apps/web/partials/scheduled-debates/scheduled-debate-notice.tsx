'use client';

import * as React from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  type DebateParticipantSummary,
  RUNNING_LATE_MINUTES,
  type RunningLateMinutes,
  type UpcomingDebateRoom,
} from '~/core/debates/api';
import { toDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { debateEntryClick } from '~/core/debates/lobbies/step-out';
import { useMinuteNow } from '~/core/debates/lobbies/use-minute-now';
import { debateActionAnalyticsAttributes, debateAnalyticsLabel } from '~/core/debates/matchmaking/hub-analytics';
import { HubPillButton, hubPillClassName } from '~/core/debates/matchmaking/hub-pill-button';
import { formatDebateTime } from '~/core/debates/matchmaking/scheduled-debates-section';
import { useGeoChatUserSummaries } from '~/core/debates/matchmaking/use-geo-chat-user-summaries';
import { useRoomFinished, useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { SCHEDULED_NOTICE_COPY as COPY } from '~/core/debates/rooms/room-copy';
import { opponentName, opponentOf, requestById, useRequestOpponent } from '~/core/debates/rooms/room-opponent';
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

import { Avatar } from '~/design-system/avatar';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
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
 * Running late and Can't make it (GEO-3427): what a debater who won't be there on time tells the
 * other one. Two ways in, each its approved board:
 *
 * - **an email's or the calendar invite's button** lands straight on the choice (board 1b);
 * - **the reschedule link once the room is open** offers the three choices first (board 2), and
 *   Running late from there is board 3, with a way back.
 *
 * In the frame the other scheduling dialogs share. Nothing is sent until a confirm press: a link only
 * opens this, because mail scanners open links.
 */
export function ScheduledDebateNoticeDialog({ open, requestId, initialStep, onClose, onReschedule, children }: Props) {
  const [step, setStep] = React.useState<ScheduledNoticeStep>(initialStep);
  // Once a press has swapped the screen, each new one's heading takes focus: the button is gone.
  const [moved, setMoved] = React.useState(false);
  const go = (next: ScheduledNoticeStep) => {
    setMoved(true);
    setStep(next);
  };
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  // Can't make it's "Suggest another time" hands over to the week, carrying the note.
  const [suggesting, setSuggesting] = React.useState<{ note: string | undefined } | null>(null);
  // Board 3 and its Back belong to arriving through board 2; an email's button lands on board 1b.
  const fromDecide = initialStep === 'decide';

  const { authenticated } = useGeoChatAuth();
  const requests = useScheduledDebates(open && authenticated);
  const rooms = useUpcomingDebateRooms(open && authenticated);
  const viewerId = useCurrentGeoChatUserId();
  const request = requestById(requests.data?.requests, requestId);
  // The week needs only their id, which the request has; the graph's name and face may never come.
  const opponentUserId = opponentOf(request, viewerId);
  const opponent = useRequestOpponent(request);
  const name = opponentName(opponent);
  const roomId = request?.room_id ?? null;
  const listed = roomId ? (rooms.data?.rooms.find(row => sameId(row.room_id, roomId)) ?? null) : null;
  // A debate that already happened stays listed as joinable until its room is swept: it is over,
  // with no room to join and nobody left to be late for.
  const finished = useRoomFinished(listed);
  const room = finished ? null : listed;

  if (suggesting && request && opponentUserId) {
    return (
      <PeerAvailabilityBookingModal
        open={open}
        userId={opponentUserId}
        peerName={opponent?.display_name ?? null}
        rescheduleRequestId={request.request_id}
        rescheduleNote={suggesting.note}
        entry="cant_make_it"
        onClose={onClose}
      />
    );
  }

  // A step or outcome draws its own heading where its board puts it, so the frame's title then only
  // names the dialog; a state message keeps it as its heading. `back` sits opposite Close.
  const shell = (
    title: string,
    body: React.ReactNode,
    { ownHeading = false, back }: { ownHeading?: boolean; back?: () => void } = {}
  ) => (
    <ScheduleDialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={title}
      hideTitle={ownHeading}
      headerLeading={back && <BackButton onClick={back} />}
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
      <>
        <Heading focus>{outcome.message}</Heading>
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
      </>,
      { ownHeading: true }
    );
  }

  const title = COPY.title[step];
  if (children) return shell(title, children);
  if (requests.isPending) return shell(title, <Notice>{COPY.loading}</Notice>);
  // A failed refetch keeps the list it had, so only a first read that failed has nothing to show.
  // Swapping the step out over one dropped poll would lose what was typed, and a cancel in flight.
  if (requests.isError && !requests.data) return shell(title, <Notice>{COPY.state.error}</Notice>);

  const state = finished ? 'over' : noticeRequestState(request);
  if (finished === null) return shell(title, <Notice>{COPY.loading}</Notice>);
  if (state !== 'active' || !request) {
    return shell(
      title,
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

  // Back to the choices, from a step reached through them; its heading takes focus on the way in,
  // since the button that was pressed is gone.
  const back = fromDecide && step !== 'decide' ? () => go('decide') : undefined;

  switch (step) {
    case 'decide':
      return shell(
        title,
        <DecideStep
          name={name}
          opponent={opponent}
          startsAt={request.scheduled_start_at}
          room={room}
          onLate={() => go('late')}
          onCant={() => go('cant')}
          onReschedule={onReschedule}
          onJoin={onClose}
          focusHeading={moved}
        />,
        { ownHeading: true }
      );
    case 'late':
      return shell(
        title,
        <LateStep
          requestId={request.request_id}
          name={name}
          variant={fromDecide ? 'decide' : 'email'}
          // geo-chat takes it only once the room is open; before then, say when that is instead.
          opensAt={room && !room.joinable ? room.opens_at : null}
          header={
            fromDecide ? undefined : (
              <DebateHeader opponent={opponent} name={name} startsAt={request.scheduled_start_at} />
            )
          }
          focusHeading={moved}
          onCant={() => go('cant')}
          onSent={expectedAt =>
            setOutcome({
              message: COPY.late.sent(name, formatClockTime(expectedAt)),
              // Only into a room that is open. A late notice can be sent the day before, from the
              // calendar invite, and Join would land on "the room opens at…".
              joinRoomId: room?.joinable ? room.room_id : null,
            })
          }
        />,
        { ownHeading: true, back }
      );
    case 'cant':
      return shell(
        title,
        <CantStep
          requestId={request.request_id}
          name={name}
          focusHeading={moved}
          onLate={() => go('late')}
          onSuggest={note => setSuggesting({ note })}
          onSent={() => setOutcome({ message: COPY.cant.sent(name), joinRoomId: null })}
        />,
        { ownHeading: true, back }
      );
  }
}

function DecideStep({
  name,
  opponent,
  startsAt,
  room,
  onLate,
  onCant,
  onReschedule,
  onJoin,
  focusHeading,
}: {
  name: string;
  opponent: DebateParticipantSummary | null;
  startsAt: string;
  room: UpcomingDebateRoom | null;
  onLate: () => void;
  onCant: () => void;
  onReschedule?: () => void;
  onJoin: () => void;
  focusHeading: boolean;
}) {
  // Re-read each minute, so "started 3 minutes ago" keeps up while the dialog is open.
  const now = useMinuteNow();

  return (
    <>
      <div className="flex flex-col items-center gap-3.5 text-center">
        <OpponentAvatar opponent={opponent} name={name} size={64} />
        <Heading focus={focusHeading}>
          {COPY.decide.heading(name, startOffset(new Date(startsAt).getTime() - now))}
        </Heading>
        {room?.others_present && (
          <span className="inline-flex items-center gap-2 rounded-full border border-grey-02 px-3 py-1.5 text-metadata">
            <span aria-hidden className="size-2 rounded-full bg-green" />
            {COPY.decide.waiting(name)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {room?.joinable && <JoinRoom roomId={room.room_id} onJoin={onJoin} label="Join now" />}
        <HubPillButton size="large" className="w-full" onClick={onLate} {...pill('Running late', 'open_running_late')}>
          {COPY.decide.late}
        </HubPillButton>
        <HubPillButton size="large" className="w-full" onClick={onCant} {...pill('Cant make it', 'open_cant_make_it')}>
          {COPY.decide.cant}
        </HubPillButton>
      </div>
      <Text as="p" variant="footnote" color="grey-04" className="text-center">
        {COPY.decide.explainer(name)}
      </Text>
      {onReschedule && (
        <Actions>
          <QuietButton onClick={onReschedule} {...analytics('Reschedule instead', 'reschedule_scheduled_debate')}>
            {COPY.decide.reschedule}
          </QuietButton>
        </Actions>
      )}
    </>
  );
}

/**
 * Running late. From an email's button it is board 1b: which debate, "Tell Maya you're running late",
 * the minutes, a note and Send. From board 2 it is board 3: "How late will you be?", a preview of
 * what they will see, Tell, and a way back.
 */
function LateStep({
  requestId,
  name,
  variant,
  opensAt,
  header,
  focusHeading,
  onCant,
  onSent,
}: {
  requestId: string;
  name: string;
  variant: 'email' | 'decide';
  opensAt: string | null;
  header?: React.ReactNode;
  focusHeading: boolean;
  onCant: () => void;
  onSent: (expectedAt: string) => void;
}) {
  const [minutes, setMinutes] = React.useState<RunningLateMinutes>(DEFAULT_LATE_MINUTES);
  const [note, setNote] = React.useState('');
  const report = useReportRunningLate();
  const noteId = React.useId();
  const viewerId = useCurrentGeoChatUserId();
  const viewerIds = React.useMemo(() => (viewerId ? [viewerId] : []), [viewerId]);
  const fromEmail = variant === 'email';
  // Only board 3's preview names the viewer.
  const viewerName = useGeoChatUserSummaries(viewerIds, !fromEmail && viewerId !== null)[0]?.display_name || null;
  const sent = noticeNote(note);

  const cantInstead = fromEmail && (
    <QuietButton onClick={onCant} {...analytics('Cant make it at all', 'open_cant_make_it')}>
      {COPY.late.cantInstead}
    </QuietButton>
  );

  return (
    <>
      {header}
      {fromEmail ? (
        <Heading focus={focusHeading}>{COPY.lateFromEmail.title(name)}</Heading>
      ) : (
        <div className="flex flex-col gap-2">
          <Heading focus={focusHeading}>{COPY.late.title}</Heading>
          <Text as="p" color="grey-04">
            {COPY.late.lead(name)}
          </Text>
        </div>
      )}
      {opensAt ? (
        // Before the room opens geo-chat refuses it (`too_early`): an estimate a day out reads as
        // nonsense beside an undated clock time. Said up front rather than after a press.
        <>
          <Notice>{COPY.lateNotYet(name, formatDebateTime(opensAt))}</Notice>
          {cantInstead && <Actions>{cantInstead}</Actions>}
        </>
      ) : (
        <>
          {/* Toggle buttons rather than a radio group: three choices, each a press, no arrow keys. */}
          <div role="group" aria-label={COPY.late.title} className="grid grid-cols-3 gap-2.5">
            {RUNNING_LATE_MINUTES.map(choice => (
              <HubPillButton
                key={choice}
                aria-pressed={minutes === choice}
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
          <NoteField
            id={noteId}
            label={fromEmail ? COPY.lateFromEmail.noteLabel(name) : COPY.late.noteLabel(name)}
            rows={fromEmail ? 2 : 3}
            value={note}
            onChange={setNote}
          />
          {!fromEmail && (
            <div className="flex flex-col gap-1 rounded-lg bg-grey-01 p-3.5">
              <Text as="p" variant="metadataMedium">
                {COPY.late.previewLabel(name)}
              </Text>
              <Text as="p" variant="metadata" color="grey-04">
                {COPY.late.preview(viewerName, minutes, sent)}
              </Text>
            </div>
          )}
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
              {fromEmail ? COPY.lateFromEmail.send(name) : COPY.late.send(name)}
            </HubPillButton>
            {cantInstead}
          </Actions>
        </>
      )}
    </>
  );
}

function CantStep({
  requestId,
  name,
  focusHeading,
  onLate,
  onSuggest,
  onSent,
}: {
  requestId: string;
  name: string;
  focusHeading: boolean;
  onLate: () => void;
  onSuggest: (note: string | undefined) => void;
  onSent: () => void;
}) {
  const [note, setNote] = React.useState('');
  const cancel = useCantMakeIt();
  const noteId = React.useId();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Heading focus={focusHeading}>{COPY.cant.title}</Heading>
        <Text as="p" color="grey-04">
          {COPY.cant.lead(name)}
        </Text>
      </div>
      <NoteField id={noteId} label={COPY.cant.noteLabel(name)} rows={3} value={note} onChange={setNote} />
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

/** Board 1b's first row: which debate this is, since an email link can land days after it was sent. */
function DebateHeader({
  opponent,
  name,
  startsAt,
}: {
  opponent: DebateParticipantSummary | null;
  name: string;
  startsAt: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <OpponentAvatar opponent={opponent} name={name} size={44} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="p" variant="metadata" color="grey-04">
          {COPY.lateFromEmail.debateWith(name)}
        </Text>
        <Text as="p" variant="metadataMedium">
          {formatDebateTime(startsAt)}
        </Text>
      </div>
    </div>
  );
}

/** The other debater's face, or the generated one until the graph has it. */
function OpponentAvatar({
  opponent,
  name,
  size,
}: {
  opponent: DebateParticipantSummary | null;
  name: string;
  size: number;
}) {
  return (
    <span className="shrink-0 overflow-hidden rounded-full" style={{ width: size, height: size }}>
      <Avatar avatarUrl={opponent?.avatar_cid} value={opponent?.profile_space_id ?? name} size={size} alt={name} />
    </span>
  );
}

/**
 * A screen's heading. `focus` takes it there on the way in, when the screen replaced the one whose
 * button was pressed, so a screen reader announces where they are rather than nothing.
 */
function Heading({ children, focus = false }: { children: React.ReactNode; focus?: boolean }) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <h2 ref={ref} tabIndex={-1} className="text-mediumTitle focus:outline-hidden">
      {children}
    </h2>
  );
}

/** The step's buttons, at the bottom of the dialog, where a thumb reaches them on a phone. */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex flex-col gap-2.5">{children}</div>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={COPY.back}
      onClick={onClick}
      {...analytics('Back', 'back_to_scheduled_notice_choices')}
      className="-m-3 grid size-10 shrink-0 place-items-center text-text transition-opacity hover:opacity-70"
    >
      <ArrowLeft />
    </button>
  );
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
  rows,
  value,
  onChange,
}: {
  id: string;
  label: string;
  rows: number;
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
        rows={rows}
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
