'use client';

import * as React from 'react';

import { sameId } from '~/core/debates/rooms/room-presence';
import { useCreateScheduledDebate, useScheduledDebates } from '~/core/debates/rooms/scheduling-hooks';

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
  const { data: scheduled } = useScheduledDebates(props.open);
  // geo-chat keeps one open invitation per pair. Every listed request includes the viewer, so one
  // with this person that they did not send is the viewer's.
  const replaces = scheduled?.requests.find(
    request =>
      request.status === 'pending' &&
      request.invited_by_user_id !== null &&
      !sameId(request.invited_by_user_id, userId) &&
      request.participants.some(participant => sameId(participant.user_id, userId))
  );

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
        replacesStart: replaces?.scheduled_start_at ?? null,
        // Loading, or failed with nothing cached: say what sending may replace rather than nothing.
        replacementUnknown: !scheduled,
      }}
    />
  );
}
