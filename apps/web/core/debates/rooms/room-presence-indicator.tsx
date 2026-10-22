'use client';

import * as React from 'react';

import cx from 'classnames';
import dynamic from 'next/dynamic';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import { debateAnalyticsLabel } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { formatTime } from '../matchmaking/scheduled-debate-format';
import { useDebateRoomContext } from './room-context';
import { ROOM_LATE_NOTICE, UNNAMED_OPPONENT, roomPresenceLabel, roomPresenceNote } from './room-copy';
import { requestForRoom } from './room-opponent';
import type { DebateRoomPresence, DebateRoomPresenceState } from './room-presence';
import { useScheduledDebates } from './scheduling-hooks';

/**
 * Who else is in the room (GEO-2941). Small, because a room is the debate-again page rather than a
 * screen of its own, and the states describe without ever navigating.
 *
 * No avatar: the room payload carries bare user ids, and nothing on the client resolves one to a
 * profile. `opponentName` falls back to a generic label until geo-chat sends participant summaries.
 */
export function DebateRoomPresenceIndicator({
  presence,
  opponentName = UNNAMED_OPPONENT,
}: {
  presence: DebateRoomPresence;
  opponentName?: string;
}) {
  const late = presence.opponentLate;
  // What they said beats what the room can guess: no "may still be on their way" under a stated time.
  const note = late ? null : roomPresenceNote(presence.state, opponentName);

  return (
    <div
      role="status"
      aria-live="polite"
      // In the picker's own sticky header rather than floating over it. A fixed overlay sat on the
      // tab strip and the leave button — including in the three states whose note tells the viewer
      // to go and find someone else.
      className="mb-3 flex flex-col items-center gap-2"
      data-room-presence={presence.state}
    >
      <div className="flex max-w-full items-center gap-2 rounded-full border border-grey-02 bg-white py-1.5 pr-3 pl-3">
        <PresenceDot state={presence.state} />
        <Text as="span" variant="metadata" className="truncate">
          {roomPresenceLabel(presence.state, opponentName)}
        </Text>
      </div>

      {note && (
        <div className="max-w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-center">
          <Text as="p" variant="footnote" color="grey-04">
            {note}
          </Text>
        </div>
      )}
    </div>
  );
}

/**
 * The week the late notice's Reschedule opens, loaded on the press: every debate room renders the
 * indicator, and few of them ever reschedule from it.
 */
const PeerAvailabilityBookingModal = dynamic(
  () => import('~/partials/availability/peer-availability-booking-modal').then(m => m.PeerAvailabilityBookingModal),
  { ssr: false }
);

/** Colour is never the only thing carrying the state; the label says it too. */
function PresenceDot({ state }: { state: DebateRoomPresenceState }) {
  const tone: Record<DebateRoomPresenceState, string> = {
    arrived_early: 'bg-grey-03',
    waiting: 'bg-orange animate-pulse',
    waiting_elsewhere: 'bg-orange animate-pulse',
    present: 'bg-green',
    left: 'bg-grey-04',
    no_show: 'bg-grey-04',
  };

  return <span aria-hidden className={cx('size-2 shrink-0 rounded-full', tone[state])} />;
}

/**
 * What the waiting debater reads once the other said they are running late (GEO-3427, board 6b):
 * how late, what they wrote, when to expect them, and Reschedule, which moves this debate to a time
 * in the late debater's week without leaving the room. The timeline and Leave on the board are
 * GEO-3428's.
 *
 * It fills the late debater's empty video slot rather than sitting above the pair: the slot is
 * unused until they join, and it is where the waiting debater is already looking for them. The
 * slot is tinted with the room's waiting orange and the title leads with an orange clock, so it
 * reads as news rather than as an empty tile. Titles use the design system's `smallTitle`; the rest
 * is `text-chat` grey, as on the card's own View profile, with the time itself set in the text
 * colour. `text-balance` keeps a two-line title or note from leaving one word on its own.
 *
 * A phone's slot is about 110px tall inside, so there the note goes and the title is capped at
 * three lines: how late, when, and Reschedule are what the waiting debater acts on. The time says
 * "By about 2:40 PM" there, on one line at every phone width from 375px (the full words need more
 * than the tile has up to about 400px, and left "PM" alone on a line). Below 375px even that does
 * not fit, so it goes; the title still says how many minutes.
 */
export function RoomLateNotice({
  late,
  opponentName,
  opponentUserId,
}: {
  late: NonNullable<DebateRoomPresence['opponentLate']>;
  opponentName: string;
  opponentUserId: string;
}) {
  const roomId = useDebateRoomContext()?.roomId ?? null;
  const requests = useScheduledDebates(roomId !== null);
  const request = roomId ? requestForRoom(requests.data?.requests, roomId) : undefined;
  const [rescheduling, setRescheduling] = React.useState(false);

  return (
    <div
      role="status"
      data-testid="room-late-notice"
      className="flex w-full max-w-[320px] flex-col items-center gap-1.5 text-center max-[767px]:gap-1"
    >
      <p className="text-smallTitle text-balance text-text max-[767px]:line-clamp-3 max-[767px]:text-chatMedium">
        <span
          aria-hidden
          className="mr-1.5 inline-flex align-[-1px] text-orange [&>svg]:size-4 max-[767px]:[&>svg]:size-3"
        >
          <Time />
        </span>
        {ROOM_LATE_NOTICE.title(opponentName, late.minutes)}
      </p>
      {late.note && (
        <p className="line-clamp-2 text-chat text-balance break-words text-grey-04 max-[767px]:hidden">“{late.note}”</p>
      )}
      <p className="text-chat text-grey-04 max-[374px]:hidden">
        <span className="max-[767px]:hidden">{ROOM_LATE_NOTICE.expectedLead}</span>
        <span className="hidden max-[767px]:inline">{ROOM_LATE_NOTICE.expectedLeadShort}</span>{' '}
        <span className="text-chatMedium whitespace-nowrap text-text">{formatTime(late.expectedAt)}</span>
      </p>
      {request?.status === 'accepted' && (
        <div className="pt-1 max-[767px]:pt-0">
          <HubPillButton
            analyticsLabel={debateAnalyticsLabel('room', 'Late notice reschedule')}
            analyticsIntent="reschedule_scheduled_debate"
            onClick={() => setRescheduling(true)}
            className="bg-white"
          >
            {ROOM_LATE_NOTICE.reschedule}
          </HubPillButton>
        </div>
      )}
      {request && rescheduling && (
        <PeerAvailabilityBookingModal
          open={rescheduling}
          userId={opponentUserId}
          peerName={opponentName === UNNAMED_OPPONENT ? null : opponentName}
          rescheduleRequestId={request.request_id}
          entry="room_late_notice"
          onClose={() => setRescheduling(false)}
        />
      )}
    </div>
  );
}
