'use client';

import { Content, Overlay, Portal, Root, Title } from '@radix-ui/react-dialog';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { type RunningLateMinutes, type UpcomingDebateRoom } from '~/core/debates/api';
import { toDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { debateEntryClick } from '~/core/debates/lobbies/step-out';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import { useGeoChatUserSummaries } from '~/core/debates/matchmaking/use-geo-chat-user-summaries';
import { useUpcomingDebateRooms } from '~/core/debates/rooms/hooks';
import { opponentName, opponentOf } from '~/core/debates/rooms/room-opponent';
import { sameId } from '~/core/debates/rooms/room-presence';
import { debateRoomPath } from '~/core/debates/rooms/room-routes';
import {
  SCHEDULED_NOTICE_COPY as COPY,
  DEFAULT_LATE_MINUTES,
  LATE_MINUTE_CHOICES,
  NOTICE_NOTE_MAX,
  type ScheduledNoticeStep,
  debateTimingHeading,
  findRequest,
  formatClock,
  noticeFailureMessage,
  noticeNote,
  noticeRequestState,
} from '~/core/debates/rooms/scheduled-notice';
import { useCantMakeIt, useReportRunningLate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { Z_LAYER_CLASS } from '~/core/z-layers';

import { Close } from '~/design-system/icons/close';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

const PRIMARY =
  'flex h-12 w-full items-center justify-center rounded-full bg-text px-5 text-button text-white transition-opacity hover:opacity-90 disabled:opacity-50';
const SECONDARY =
  'flex h-12 w-full items-center justify-center rounded-full border border-grey-02 bg-white px-5 text-button text-text transition-colors hover:bg-grey-01 disabled:opacity-50';
const QUIET = 'self-center px-3 py-2 text-metadata text-text underline underline-offset-2 hover:opacity-70';

function analytics(action: string, intent: string) {
  return debateActionAnalyticsAttributes('scheduled-notice', action, intent);
}

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
 * the reschedule link once the room is open.
 *
 * Nothing is sent until a confirm press. A link only opens this, because mail scanners open links.
 */
export function ScheduledDebateNoticeDialog({ open, requestId, initialStep, onClose, onReschedule, children }: Props) {
  const [step, setStep] = React.useState<ScheduledNoticeStep>(initialStep);
  // Can't make it's "Suggest another time" hands over to the week, carrying the note.
  const [suggesting, setSuggesting] = React.useState<{ note: string | undefined } | null>(null);

  const { authenticated } = useGeoChatAuth();
  const requests = useScheduledDebates(open && authenticated);
  const rooms = useUpcomingDebateRooms(open && authenticated);
  const viewerId = useCurrentGeoChatUserId();
  const request = findRequest(requests.data?.requests, requestId);
  const opponentUserId = opponentOf(request, viewerId);
  const ids = React.useMemo(
    () => [opponentUserId, viewerId].filter((id): id is string => id !== null),
    [opponentUserId, viewerId]
  );
  const people = useGeoChatUserSummaries(ids, ids.length > 0);
  const opponent = people.find(person => opponentUserId !== null && sameId(person.user_id, opponentUserId)) ?? null;
  const viewer = people.find(person => viewerId !== null && sameId(person.user_id, viewerId)) ?? null;
  const name = opponentName(opponent);
  const room = request?.room_id
    ? (rooms.data?.rooms.find(row => sameId(row.room_id, request.room_id ?? '')) ?? null)
    : null;

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

  const body = (() => {
    if (children) return children;
    if (requests.isPending) return <Status busy>{COPY.loading}</Status>;
    if (requests.isError) return <Status>{COPY.state.error}</Status>;

    const state = noticeRequestState(request);
    if (state !== 'active' || !request) {
      return (
        <div className="flex flex-col gap-4">
          <Status>{COPY.state[state === 'active' ? 'missing' : state]}</Status>
          {state === 'moved' && (
            <Link
              href={toDebatesPanel({ tab: 'requests' })}
              onClick={onClose}
              className={SECONDARY}
              {...analytics('Open Requests', 'open_requests_from_notice')}
            >
              {COPY.state.requests}
            </Link>
          )}
        </div>
      );
    }

    switch (step) {
      case 'decide':
        return (
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
        return (
          <LateStep
            requestId={request.request_id}
            roomId={request.room_id}
            name={name}
            viewerName={viewer?.display_name || null}
            onCant={() => setStep('cant')}
            onDone={onClose}
          />
        );
      case 'cant':
        return (
          <CantStep
            requestId={request.request_id}
            name={name}
            onLate={() => setStep('late')}
            onSuggest={note => setSuggesting({ note })}
            onDone={onClose}
          />
        );
    }
  })();

  return (
    <Root open={open} onOpenChange={next => !next && onClose()}>
      <Portal>
        <Overlay className={cx('fixed inset-0 bg-text/20', Z_LAYER_CLASS.scheduleDialogBackdrop)} />
        <Content
          aria-describedby={undefined}
          className={cx(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-hidden md:inset-0 md:translate-x-0 md:translate-y-0',
            Z_LAYER_CLASS.scheduleDialog
          )}
        >
          <div className="relative flex max-h-[calc(100dvh-2rem)] w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-5 overflow-y-auto rounded-xl bg-white p-6 shadow-card md:h-dvh md:max-h-dvh md:w-screen md:max-w-none md:rounded-none md:px-4 md:pt-5 md:pb-7">
            <Title asChild>
              <span className="sr-only">
                {step === 'late' ? 'Running late' : step === 'cant' ? 'Can’t make it' : 'Your debate'}
              </span>
            </Title>
            <div className="flex justify-end">
              <button
                type="button"
                aria-label="Close"
                {...analytics('Close', 'close_scheduled_notice')}
                onClick={onClose}
                className="-m-3 grid size-11 place-items-center text-text transition-opacity hover:opacity-70"
              >
                <Close />
              </button>
            </div>
            {body}
          </div>
        </Content>
      </Portal>
    </Root>
  );
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
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-mediumTitle">{debateTimingHeading(name, startsAt)}</h2>
        {room?.others_present && (
          <span className="inline-flex items-center gap-2 rounded-full border border-grey-02 px-3 py-1.5 text-metadata">
            <span aria-hidden className="size-2 rounded-full bg-green" />
            {COPY.decide.waiting(name)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {room?.joinable && (
          <JoinRoom roomId={room.room_id} onJoin={onJoin} label="Join now">
            {COPY.decide.join}
          </JoinRoom>
        )}
        <button
          type="button"
          className={SECONDARY}
          onClick={onLate}
          {...analytics('Running late', 'open_running_late')}
        >
          {COPY.decide.late}
        </button>
        <button
          type="button"
          className={SECONDARY}
          onClick={onCant}
          {...analytics('Cant make it', 'open_cant_make_it')}
        >
          {COPY.decide.cant}
        </button>
      </div>
      <Text as="p" variant="footnote" color="grey-04" className="text-center">
        {COPY.decide.explainer(name)}
      </Text>
      {onReschedule && (
        <>
          <div className="flex-1" />
          <button
            type="button"
            className={QUIET}
            onClick={onReschedule}
            {...analytics('Reschedule instead', 'reschedule_scheduled_debate')}
          >
            {COPY.decide.reschedule}
          </button>
        </>
      )}
    </div>
  );
}

function LateStep({
  requestId,
  roomId,
  name,
  viewerName,
  onCant,
  onDone,
}: {
  requestId: string;
  roomId: string | null;
  name: string;
  viewerName: string | null;
  onCant: () => void;
  onDone: () => void;
}) {
  const [minutes, setMinutes] = React.useState<RunningLateMinutes>(DEFAULT_LATE_MINUTES);
  const [note, setNote] = React.useState('');
  const report = useReportRunningLate();
  const noteId = React.useId();

  if (report.isSuccess) {
    return (
      <Done message={COPY.late.sent(name, formatClock(report.data.expected_at))} onDone={onDone}>
        {roomId && (
          <JoinRoom roomId={roomId} onJoin={onDone} label="Join the room">
            {COPY.late.join}
          </JoinRoom>
        )}
      </Done>
    );
  }

  const sent = noticeNote(note);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-mediumTitle">{COPY.late.title}</h2>
        <Text as="p" color="grey-04">
          {COPY.late.lead(name)}
        </Text>
      </div>
      <div role="radiogroup" aria-label={COPY.late.title} className="grid grid-cols-3 gap-2.5">
        {LATE_MINUTE_CHOICES.map(choice => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={minutes === choice}
            onClick={() => setMinutes(choice)}
            {...analytics(`${choice} min`, 'pick_running_late_minutes')}
            className={cx(
              'h-14 rounded-xl border text-button transition-colors',
              minutes === choice
                ? 'border-text bg-text text-white'
                : 'border-grey-02 bg-white text-text hover:bg-grey-01'
            )}
          >
            {COPY.late.minutes(choice)}
          </button>
        ))}
      </div>
      <NoteField id={noteId} label={COPY.late.noteLabel(name)} value={note} onChange={setNote} />
      <div className="flex flex-col gap-1 rounded-lg bg-grey-01 p-3.5">
        <Text as="p" variant="metadataMedium">
          {COPY.late.previewLabel(name)}
        </Text>
        <Text as="p" variant="metadata" color="grey-04">
          {COPY.late.preview(viewerName || 'You', minutes, sent)}
        </Text>
      </div>
      {report.isError && <ErrorLine>{noticeFailureMessage(report.error, 'late')}</ErrorLine>}
      <div className="flex-1" />
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className={PRIMARY}
          disabled={report.isPending}
          onClick={() => report.mutate({ requestId, minutes, note: sent })}
          {...analytics('Tell', 'confirm_running_late')}
        >
          {report.isPending ? COPY.late.sending : COPY.late.send(name)}
        </button>
        <button
          type="button"
          className={QUIET}
          onClick={onCant}
          {...analytics('Cant make it at all', 'open_cant_make_it')}
        >
          {COPY.late.cantInstead}
        </button>
      </div>
    </div>
  );
}

function CantStep({
  requestId,
  name,
  onLate,
  onSuggest,
  onDone,
}: {
  requestId: string;
  name: string;
  onLate: () => void;
  onSuggest: (note: string | undefined) => void;
  onDone: () => void;
}) {
  const [note, setNote] = React.useState('');
  const cancel = useCantMakeIt();
  const noteId = React.useId();

  if (cancel.isSuccess) return <Done message={COPY.cant.sent(name)} onDone={onDone} />;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-mediumTitle">{COPY.cant.title}</h2>
        <Text as="p" color="grey-04">
          {COPY.cant.lead(name)}
        </Text>
      </div>
      <NoteField id={noteId} label={COPY.cant.noteLabel(name)} value={note} onChange={setNote} />
      {cancel.isError && <ErrorLine>{noticeFailureMessage(cancel.error, 'cant')}</ErrorLine>}
      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className={PRIMARY}
          disabled={cancel.isPending}
          onClick={() => cancel.mutate({ requestId, note: noticeNote(note) })}
          {...analytics('Cancel the debate', 'confirm_cant_make_it')}
        >
          {cancel.isPending ? COPY.cant.confirming : COPY.cant.confirm}
        </button>
        <button
          type="button"
          className={SECONDARY}
          disabled={cancel.isPending}
          onClick={() => onSuggest(noticeNote(note))}
          {...analytics('Suggest another time', 'suggest_time_cant_make_it')}
        >
          {COPY.cant.suggest}
        </button>
        <Text as="p" variant="footnote" color="grey-04" className="text-center">
          {COPY.cant.suggestHint(name)}
        </Text>
        <button
          type="button"
          className={QUIET}
          onClick={onLate}
          {...analytics('Only running late', 'open_running_late')}
        >
          {COPY.cant.lateInstead}
        </button>
      </div>
    </div>
  );
}

/** Into the room, stepping out of a lobby first as every way into a debate does. */
function JoinRoom({
  roomId,
  onJoin,
  label,
  children,
}: {
  roomId: string;
  onJoin: () => void;
  label: string;
  children: React.ReactNode;
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
      className={PRIMARY}
      {...analytics(label, 'join_scheduled_debate')}
    >
      {children}
    </Link>
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

function Done({ message, onDone, children }: { message: string; onDone: () => void; children?: React.ReactNode }) {
  return (
    <div role="status" className="flex flex-1 flex-col gap-6">
      <h2 className="text-mediumTitle">{message}</h2>
      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        {children}
        <button type="button" className={children ? SECONDARY : PRIMARY} onClick={onDone}>
          {COPY.done}
        </button>
      </div>
    </div>
  );
}

function Status({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div role="status" className="flex items-center gap-3">
      {busy && <Spinner />}
      <Text color="grey-04">{children}</Text>
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
