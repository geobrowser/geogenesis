'use client';

import * as React from 'react';

import { GeoChatRequestError, type ScheduledDebateRequest } from '~/core/debates/api';
import { requestById } from '~/core/debates/rooms/room-opponent';
import {
  useCreateScheduledDebate,
  useNoTimeWorks,
  useRescheduleScheduledDebate,
  useScheduledDebates,
} from '~/core/debates/rooms/scheduling-hooks';
import { noticeFailureMessage } from '~/core/debates/rooms/scheduling-refusals';
import { useSetToast } from '~/core/hooks/use-toast';

import { firstName } from '~/partials/profile/claim-response-tag';
import { ScheduledDebateNoticeDialog } from '~/partials/scheduled-debates/scheduled-debate-notice';

import { peerDisplayName, requestSentMessage } from './peer-availability';
import { PeerAvailabilityModal } from './peer-availability-modal';
import { RescheduleCloseWarning } from './reschedule-close-warning';

/** A slot is 30 minutes, so a booking is one slot. */
const SCHEDULED_DEBATE_MINUTES = 30;

type Props = Omit<React.ComponentProps<typeof PeerAvailabilityModal>, 'booking'> & {
  /**
   * Picking a slot moves this request instead of proposing a new one. Set by a scheduling email's
   * "Choose different time" (see `core/availability/availability-deep-link`), and by the Requests
   * tab's Reschedule on an accepted debate, which geo-chat sends back to pending for the new time,
   * and its "Choose different time" on an invite the viewer has yet to answer.
   */
  rescheduleRequestId?: string | null;
  /**
   * What someone wrote under Can't make it (GEO-3427). Kept on the room, where the other debater sees
   * it; the email about the new time carries the approved copy only.
   */
  rescheduleNote?: string;
  /**
   * A new request the server accepted, before the requests list has been read again. The calendar
   * (GEO-3152) draws it on its week straight away with this.
   */
  onRequested?: (request: ScheduledDebateRequest) => void;
};

/**
 * The bookable week. Separate from the modal so the mutation, and the query client it needs, only
 * enter the tree where booking is turned on.
 */
export function PeerAvailabilityBookingModal({
  userId,
  onClose,
  rescheduleRequestId = null,
  rescheduleNote,
  entry = null,
  onRequested,
  ...props
}: Props) {
  const propose = useCreateScheduledDebate();
  const reschedule = useRescheduleScheduledDebate();
  const noneWork = useNoTimeWorks();
  const mutation = rescheduleRequestId ? reschedule : propose;
  const mode = rescheduleRequestId ? 'reschedule' : 'request';
  const setToast = useSetToast();
  const peer = peerDisplayName(props.peerName, userId);
  const peerFirst = firstName(peer) ?? peer;

  // The debate being moved (GEO-3429): its time and whether it was agreed, from the requests list
  // every reschedule surface already reads. Until it lands the week shows as it always has.
  const requests = useScheduledDebates(Boolean(rescheduleRequestId) && props.open);
  const request = requestById(requests.data?.requests, rescheduleRequestId);
  const active = request && (request.status === 'accepted' || request.status === 'pending') ? request : undefined;
  const agreed = active?.status === 'accepted';
  // Closing without a new time leaves an agreed debate on, which is easy to miss when you meant to
  // move it; so it asks first (board 4b). "Can't make it" from there swaps to that screen.
  const [step, setStep] = React.useState<'week' | 'warn' | 'cant'>('week');

  const close = () => {
    setStep('week');
    onClose();
    // Otherwise the next person's week opens already showing the last one's outcome.
    mutation.reset();
    noneWork.reset();
  };
  const requestClose = () => (agreed ? setStep('warn') : close());

  // A sent request is the end of the job, so the week closes on it and the confirmation moves to a
  // toast. Per-call rather than on the hook: closing mid-flight resets the mutation, which detaches
  // these callbacks, so a late success cannot close a week opened since.
  const onSent = (request: ScheduledDebateRequest, viewerTimezone: string) => {
    if (mode === 'request') onRequested?.(request);
    setToast(
      <span>
        {requestSentMessage({
          mode,
          startsAt: request.scheduled_start_at,
          peerName: peerDisplayName(props.peerName, userId),
          viewerTimezone,
        })}
      </span>
    );
    close();
  };

  if (step === 'cant' && rescheduleRequestId) {
    return (
      <ScheduledDebateNoticeDialog
        open={props.open}
        requestId={rescheduleRequestId}
        initialStep="cant"
        onClose={close}
      />
    );
  }

  return (
    <>
      <PeerAvailabilityModal
        {...props}
        userId={userId}
        entry={entry}
        onClose={requestClose}
        booking={{
          mode,
          requestId: rescheduleRequestId,
          moving: active ? { startsAt: active.scheduled_start_at, agreed } : null,
          noTimeWorks:
            active && rescheduleRequestId
              ? {
                  onPress: () =>
                    noneWork.mutate(
                      { requestId: rescheduleRequestId },
                      {
                        onSuccess: () => {
                          setToast(<span>{noTimeWorksSentMessage(peerFirst)}</span>);
                          close();
                        },
                      }
                    ),
                  pending: noneWork.isPending,
                  error: noneWork.error ? noticeFailureMessage(noneWork.error, 'cant') : null,
                }
              : null,
          onRequest: (startsAt, pick) => {
            const slot = {
              startsAt: new Date(startsAt),
              minutes: SCHEDULED_DEBATE_MINUTES,
              analytics: { entry, viewerIsFree: pick.viewerIsFree },
            };
            const callbacks = {
              onSuccess: (request: ScheduledDebateRequest) => onSent(request, pick.viewerTimezone),
            };
            if (rescheduleRequestId) {
              reschedule.mutate({ requestId: rescheduleRequestId, note: rescheduleNote, ...slot }, callbacks);
            } else propose.mutate({ opponentUserId: userId, ...slot }, callbacks);
          },
          pending: mutation.isPending,
          error: mutation.error
            ? rescheduleRequestId
              ? rescheduleFailureMessage(mutation.error)
              : mutation.error.message
            : null,
        }}
      />
      {step === 'warn' && active && (
        <RescheduleCloseWarning
          open
          peerFirstName={peerFirst}
          startsAt={active.scheduled_start_at}
          onCantMakeIt={() => setStep('cant')}
          onKeep={close}
          onBack={() => setStep('week')}
        />
      )}
    </>
  );
}

/** Said once "None of these work" has gone through (GEO-3429). */
export function noTimeWorksSentMessage(peerFirstName: string) {
  return `Debate cancelled. We’ve sent ${peerFirstName} your free times to pick from.`;
}

/** geo-chat's refusals of a move, said plainly; anything else keeps its own message. */
export function rescheduleFailureMessage(error: unknown): string {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'debate_already_started') {
      return 'This debate has already started, so its time can no longer be changed.';
    }
    if (error.code === 'schedule_conflict') return 'You already have a debate at that time. Pick another.';
    if (error.code === 'reschedule_refused') {
      return /too_many_reschedules/.test(error.message)
        ? 'This debate has been moved too many times. Cancel it and send a new request instead.'
        : 'This debate has already been declined, cancelled or expired.';
    }
  }
  return error instanceof Error ? error.message : 'Could not change the time. Try again.';
}
