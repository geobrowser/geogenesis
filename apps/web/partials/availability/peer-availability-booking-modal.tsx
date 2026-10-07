'use client';

import * as React from 'react';

import { GeoChatRequestError, type ScheduledDebateRequest } from '~/core/debates/api';
import { useCreateScheduledDebate, useRescheduleScheduledDebate } from '~/core/debates/rooms/scheduling-hooks';
import { useSetToast } from '~/core/hooks/use-toast';

import { peerDisplayName, requestSentMessage } from './peer-availability';
import { PeerAvailabilityModal } from './peer-availability-modal';

/** A slot is 30 minutes, so a booking is one slot. */
const SCHEDULED_DEBATE_MINUTES = 30;

type Props = Omit<React.ComponentProps<typeof PeerAvailabilityModal>, 'booking'> & {
  /**
   * Picking a slot moves this request instead of proposing a new one. Set by a scheduling email's
   * "Choose different time" (see `core/availability/availability-deep-link`), and by the Requests
   * tab's Reschedule on an accepted debate, which geo-chat sends back to pending for the new time.
   */
  rescheduleRequestId?: string | null;
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
  entry = null,
  onRequested,
  ...props
}: Props) {
  const propose = useCreateScheduledDebate();
  const reschedule = useRescheduleScheduledDebate();
  const mutation = rescheduleRequestId ? reschedule : propose;
  const mode = rescheduleRequestId ? 'reschedule' : 'request';
  const setToast = useSetToast();

  const close = () => {
    onClose();
    // Otherwise the next person's week opens already showing the last one's outcome.
    mutation.reset();
  };

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

  return (
    <PeerAvailabilityModal
      {...props}
      userId={userId}
      entry={entry}
      onClose={close}
      booking={{
        mode,
        onRequest: (startsAt, pick) => {
          const slot = {
            startsAt: new Date(startsAt),
            minutes: SCHEDULED_DEBATE_MINUTES,
            analytics: { entry, viewerIsFree: pick.viewerIsFree },
          };
          const callbacks = {
            onSuccess: (request: ScheduledDebateRequest) => onSent(request, pick.viewerTimezone),
          };
          if (rescheduleRequestId) reschedule.mutate({ requestId: rescheduleRequestId, ...slot }, callbacks);
          else propose.mutate({ opponentUserId: userId, ...slot }, callbacks);
        },
        pending: mutation.isPending,
        error: mutation.error
          ? rescheduleRequestId
            ? rescheduleFailureMessage(mutation.error)
            : mutation.error.message
          : null,
      }}
    />
  );
}

/** geo-chat's refusals of a move, said plainly; anything else keeps its own message. */
export function rescheduleFailureMessage(error: unknown): string {
  if (error instanceof GeoChatRequestError) {
    if (error.code === 'debate_already_started') {
      return 'Someone has already joined this debate, so its time can no longer be changed.';
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
