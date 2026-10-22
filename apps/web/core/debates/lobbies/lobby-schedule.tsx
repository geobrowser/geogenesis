'use client';

import * as React from 'react';

import { peerScheduleDays } from '~/core/availability/peer-schedule';
import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { useQueuedAction } from '~/core/state/pending-actions';

import { Text } from '~/design-system/text';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import type { DebateLobbyMember } from '../api';
import { usePeerSchedule } from '../hooks';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { CancelScheduled } from '../matchmaking/scheduled-debates-section';
import { INLINE_SLOTS, SharedTimes, formatSlot } from '../matchmaking/shared-times';
import { opponentOf } from '../rooms/room-opponent';
import { sameId } from '../rooms/room-presence';
import { useOpenScheduledRequests } from '../rooms/scheduled-awaiting';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { personName } from './lobby-format';
import { useIsLobbyGuest } from './lobby-guest-hooks';
import { lobbyAuthPage, useLobbyGuestSignIn } from './lobby-guest-sign-in';
import { useLobbyHandoff } from './lobby-popup';
import type { LobbyPageView } from './lobby-view';
import { useMinuteNow } from './use-minute-now';

export type LobbyBooking = {
  userId: string;
  name: string;
  entry: ScheduleEntry;
  initialStart?: string;
  disagreementCount?: number | null;
  requestId?: string;
};

const LobbyScheduleContext = React.createContext<(booking: LobbyBooking, opener?: HTMLElement) => void>(
  () => undefined
);
export const useLobbySchedule = () => React.useContext(LobbyScheduleContext);

/** Keeps the booking outside the menu's focus trap and alive after that menu closes. */
export function LobbyScheduleProvider({ lobby, children }: { lobby: LobbyPageView; children: React.ReactNode }) {
  const guest = useIsLobbyGuest();
  const viewerId = useCurrentGeoChatUserId();
  const [selection, setSelection] = React.useState<{ viewerId: string | null; booking: LobbyBooking | null }>({
    viewerId,
    booking: null,
  });
  // A booking belongs to the account that opened it. Signing out or switching accounts drops it.
  if (selection.viewerId !== viewerId) setSelection({ viewerId, booking: null });
  const booking = selection.viewerId === viewerId ? selection.booking : null;
  const setBooking = (next: LobbyBooking | null) => setSelection({ viewerId, booking: next });
  const openerRef = React.useRef<HTMLElement | null>(null);
  const signIn = useLobbyGuestSignIn(lobby.lobby_id);
  const queued = useQueuedAction({
    id: `lobby-schedule:${lobby.lobby_id}`,
    component: 'debate_matchmaking',
    label: 'scheduling your debate',
    liveOnly: true,
    ready: !guest && viewerId !== null,
    run: (intent, { isCurrent }) => {
      if (!intent || !isCurrent()) return;
      const next = JSON.parse(intent) as LobbyBooking;
      if (viewerId && !sameId(next.userId, viewerId)) setBooking(next);
    },
  });
  const open = (next: LobbyBooking, opener?: HTMLElement) => {
    openerRef.current = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!guest) {
      if (!viewerId || sameId(next.userId, viewerId)) return;
      setBooking(next);
      return;
    }
    queued.queue(JSON.stringify(next));
    signIn(
      {
        ...lobbyAuthPage(lobby.lobby_id),
        component: 'debate_matchmaking',
        target_type: 'debate_user',
        target_id: next.userId,
        auth_control: 'schedule_debate',
        auth_intent: 'start_debate',
        auth_continuation: 'queued',
      },
      { onCancel: queued.cancel }
    );
  };

  return (
    <LobbyScheduleContext.Provider value={open}>
      {children}
      {!guest && booking ? (
        <PeerAvailabilityBookingModal
          open
          userId={booking.userId}
          peerName={booking.name}
          initialSelectedStart={booking.initialStart}
          disagreementCount={booking.disagreementCount}
          entry={booking.entry}
          rescheduleRequestId={booking.requestId}
          openerRef={openerRef}
          onClose={() => setBooking(null)}
        />
      ) : null}
    </LobbyScheduleContext.Provider>
  );
}

/** Only mounted for someone else's open menu, so the roster does not fetch a week per person. */
export function LobbyScheduleSection({
  member,
  disagreements,
}: {
  member: DebateLobbyMember;
  disagreements: number | null;
}) {
  const guest = useIsLobbyGuest();
  const open = useLobbySchedule();
  const { handoff } = useLobbyHandoff();
  const pick = (initialStart?: string, entry: ScheduleEntry = 'lobby_schedule') =>
    handoff(() =>
      open({ userId: member.user_id, name: personName(member), initialStart, entry, disagreementCount: disagreements })
    );

  return (
    <section
      aria-label="Schedule for later"
      className="mt-1 flex flex-col gap-2 border-t border-grey-01 px-1.5 pt-3 pb-1.5"
    >
      <Text as="p" variant="footnoteMedium" color="grey-04">
        Schedule for later
      </Text>
      {guest ? (
        <HubPillButton
          analyticsSurface="lobby"
          analyticsLabel="Lobby guest schedule debate"
          analyticsIntent="open_peer_availability"
          className="md:min-h-11"
          onClick={() => pick()}
        >
          Sign in to schedule
        </HubPillButton>
      ) : (
        <MemberSchedule member={member} onPick={pick} />
      )}
    </section>
  );
}

function MemberSchedule({
  member,
  onPick,
}: {
  member: DebateLobbyMember;
  onPick: (start?: string, entry?: ScheduleEntry) => void;
}) {
  const peer = usePeerSchedule(member.user_id);
  const requests = useScheduledDebates();
  const openRequests = useOpenScheduledRequests(requests.data?.requests);
  const viewerId = useCurrentGeoChatUserId();
  const now = useMinuteNow();
  const pending = openRequests.filter(request => {
    const opponent = opponentOf(request, viewerId);
    return (
      !request.viewer_must_answer &&
      viewerId !== null &&
      request.proposed_by_user_id !== null &&
      sameId(request.proposed_by_user_id, viewerId) &&
      opponent !== null &&
      sameId(opponent, member.user_id)
    );
  });
  // One chip per day first, so a free afternoon does not fill the whole menu.
  const slots = peer.schedule
    ? peerScheduleDays(peer.schedule, new Date(now))
        .flatMap(day =>
          day.slots
            .filter(slot => Date.parse(slot.start) > now)
            .slice(0, 1)
            .map(slot => ({
              start: slot.start,
              viewerIsFree: peer.schedule?.viewerHasSchedule ? (slot.viewerIsFree ?? undefined) : undefined,
            }))
        )
        .slice(0, INLINE_SLOTS)
    : [];

  return (
    <>
      {pending.map(request => (
        <div key={request.request_id} className="flex flex-col gap-1 rounded-lg bg-grey-01 p-2 [&_button]:md:min-h-11">
          <Text as="p" variant="footnoteMedium">
            Requested {formatSlot(request.scheduled_start_at, new Date(now), peer.schedule?.viewerTimezone)}
          </Text>
          <Text as="p" variant="footnote" color="grey-04">
            Awaiting response
          </Text>
          <CancelScheduled requestId={request.request_id} kind="request" opponent={member} analyticsSurface="lobby" />
        </div>
      ))}
      {peer.isPending ? (
        <Text as="p" variant="footnote" color="grey-04">
          Loading availability…
        </Text>
      ) : null}
      {peer.isError ? (
        <p role="alert" className="text-footnote text-grey-04">
          Couldn’t load their availability.{' '}
          <button type="button" className="underline" onClick={() => void peer.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {peer.schedule && !peer.schedule.peerHasSchedule ? (
        <Text as="p" variant="footnote" color="grey-04">
          {personName(member)} hasn’t set any availability yet.
        </Text>
      ) : null}
      {peer.schedule?.peerHasSchedule && slots.length === 0 ? (
        <Text as="p" variant="footnote" color="grey-04">
          No upcoming free times this week.
        </Text>
      ) : null}
      {slots.length > 0 ? (
        <SharedTimes
          touchSized
          analyticsSurface="lobby"
          personName={personName(member)}
          timezone={peer.schedule?.viewerTimezone}
          schedule={{ slots, truncated: true }}
          onPick={start => onPick(start, start ? 'lobby_time' : 'lobby_more_times')}
        />
      ) : null}
      {peer.schedule && slots.length === 0 ? (
        <HubPillButton
          analyticsSurface="lobby"
          analyticsLabel="Lobby ask for a time"
          analyticsIntent="open_peer_availability"
          className="md:min-h-11"
          onClick={() => onPick()}
        >
          Ask for a time
        </HubPillButton>
      ) : null}
    </>
  );
}
