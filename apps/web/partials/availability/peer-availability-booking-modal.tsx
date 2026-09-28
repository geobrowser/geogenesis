'use client';

import * as React from 'react';

import { useCreateScheduledDebate } from '~/core/debates/rooms/scheduling-hooks';

import { PeerAvailabilityModal } from './peer-availability-modal';

/** A slot is 30 minutes, so a booking is one slot. */
const SCHEDULED_DEBATE_MINUTES = 30;

type Props = Omit<React.ComponentProps<typeof PeerAvailabilityModal>, 'booking'>;

/**
 * The bookable week. Separate from the modal so the mutation, and the query client it needs, only
 * enter the tree where booking is turned on.
 */
export function PeerAvailabilityBookingModal({ userId, onClose, ...props }: Props) {
  const propose = useCreateScheduledDebate();

  return (
    <PeerAvailabilityModal
      {...props}
      userId={userId}
      onClose={() => {
        onClose();
        // Otherwise the next person's week opens already showing the last one's outcome.
        propose.reset();
      }}
      booking={{
        onRequest: startsAt =>
          propose.mutate({
            opponentUserId: userId,
            startsAt: new Date(startsAt),
            minutes: SCHEDULED_DEBATE_MINUTES,
          }),
        pending: propose.isPending,
        error: propose.error?.message ?? null,
        requestedStart: propose.data?.scheduled_start_at ?? null,
      }}
    />
  );
}
