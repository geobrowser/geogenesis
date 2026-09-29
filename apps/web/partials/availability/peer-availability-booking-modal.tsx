'use client';

import * as React from 'react';

import { useCreateScheduledDebate, useRescheduleScheduledDebate } from '~/core/debates/rooms/scheduling-hooks';

import { PeerAvailabilityModal } from './peer-availability-modal';

/** A slot is 30 minutes, so a booking is one slot. */
const SCHEDULED_DEBATE_MINUTES = 30;

type Props = Omit<React.ComponentProps<typeof PeerAvailabilityModal>, 'booking'> & {
  /**
   * Picking a slot moves this pending request instead of proposing a new one. Set by a scheduling
   * email's "Choose different time" (see `core/availability/availability-deep-link`).
   */
  rescheduleRequestId?: string | null;
};

/**
 * The bookable week. Separate from the modal so the mutation, and the query client it needs, only
 * enter the tree where booking is turned on.
 */
export function PeerAvailabilityBookingModal({ userId, onClose, rescheduleRequestId = null, ...props }: Props) {
  const propose = useCreateScheduledDebate();
  const reschedule = useRescheduleScheduledDebate();
  const mutation = rescheduleRequestId ? reschedule : propose;

  return (
    <PeerAvailabilityModal
      {...props}
      userId={userId}
      onClose={() => {
        onClose();
        // Otherwise the next person's week opens already showing the last one's outcome.
        mutation.reset();
      }}
      booking={{
        mode: rescheduleRequestId ? 'reschedule' : 'request',
        onRequest: startsAt => {
          const slot = { startsAt: new Date(startsAt), minutes: SCHEDULED_DEBATE_MINUTES };
          if (rescheduleRequestId) reschedule.mutate({ requestId: rescheduleRequestId, ...slot });
          else propose.mutate({ opponentUserId: userId, ...slot });
        },
        pending: mutation.isPending,
        error: mutation.error?.message ?? null,
        requestedStart: mutation.data?.scheduled_start_at ?? null,
      }}
    />
  );
}
