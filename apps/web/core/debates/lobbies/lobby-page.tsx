'use client';

import * as React from 'react';

import Link from 'next/link';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { CallRoom } from '~/core/space-calls/call-room';
import { EndedCallRecording } from '~/core/space-calls/recording/ended-call-recording';
import { spaceCallPath } from '~/core/space-calls/routes';
import { useBrowseSidebarPageDefault } from '~/core/state/browse-sidebar-state';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateLobbyView } from '../api';
import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { HubHeaderControls } from '../matchmaking/hub-header-controls';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { debateRoomPath } from '../rooms/room-routes';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import {
  type LobbyPresenceRoster,
  type LobbyPresenceState,
  useDebateLobby,
  useDebateLobbyReminder,
  useEndDebateLobby,
  useLobbyPresence,
} from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { LobbyClaimsArea } from './lobby-claims-area';
import { useClaimsTabMark } from './lobby-claims-mark';
import { useExitLobbyWhenOut, useLobbyExitHref } from './lobby-exit';
import {
  RSVP_FAILED,
  goingLabel,
  hostsLabel,
  lobbyDateLabel,
  lobbyErrorMessage,
  notYetOpenLabel,
  rsvpLabel,
} from './lobby-format';
import { LOBBY_GUEST_COPY, LobbyGuestBanner } from './lobby-guest';
import {
  LobbyGuestProvider,
  type LobbyMemberPath,
  useDebateLobbyGuestView,
  useIsLobbyGuest,
  useLobbyGuestSession,
} from './lobby-guest-hooks';
import { useLobbySignInPrompt } from './lobby-guest-sign-in';
import { LobbyHeader } from './lobby-header';
import { useLobbyHighlights } from './lobby-highlights-hooks';
import { usePreOpenHosts } from './lobby-host-lobbies';
import { EndPickerLeftBehind } from './lobby-left-picker';
import { LobbyHostLists, LobbyRemovedNotice } from './lobby-moderation';
import { type LobbyRoomNoun, useIsCallRoom, useLobbyRoomPurpose } from './lobby-purpose';
import { LobbyQueuedRequestProvider, useLobbyQueuedRequest } from './lobby-queued-request';
import { LobbyAnalyticsScope } from './lobby-room-analytics';
import { useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { LOBBY_ROOM_COPY, type LobbyPhoneTab, LobbyRoomShell } from './lobby-room-shell';
import { LobbyPeople } from './lobby-roster';
import { LobbyScheduleProvider } from './lobby-schedule';
import { LobbyScheduledRequests } from './lobby-scheduled-requests';
import {
  CALL_STATE_COPY,
  FindDebateLink,
  LOBBY_STATE_COPY,
  LobbyBannedCard,
  LobbyCardFrame,
  LobbyClosedCard,
} from './lobby-state-cards';
import { type LobbyPageView, isMemberView, lobbyViewForGuest, lobbyViewForMember } from './lobby-view';
import { useMinuteNow } from './use-minute-now';

export const LOBBY_COPY = {
  leaveOther: (name: string | null, other: LobbyRoomNoun = 'lobby') =>
    name ? `Leave ${name}?` : `Leave your other ${other}?`,
  oneLobby: (name: string) => `You can be in one lobby at a time. Joining ${name} will leave it.`,
  oneRoom: (name: string) => `You can be in one call or lobby at a time. Joining ${name} will leave it.`,
  scheduled: 'Debate lobby · scheduled',
  guestBeforeOpen: 'No account? You can still join and listen when it opens.',
  movedToOther: (name: string | null, other: LobbyRoomNoun = 'lobby') =>
    `You joined ${name ?? `another ${other}`} in another tab.`,
  guestRemovedFromCall: 'A host removed you from this call.',
  guestRemoved: LOBBY_STATE_COPY.removed,
  guestRemovedInvite: 'Create an account to come back and take part.',
  guestElsewhere: LOBBY_ROOM_COPY.guestElsewhere,
  guestPaused: LOBBY_ROOM_COPY.guestPaused,
  guestListeningOff: LOBBY_ROOM_COPY.guestListeningOff,
} as const;

export { useHandoffNotice } from './lobby-room-shell';

const findDebateAction = { href: NavUtils.toExplore(), label: LOBBY_STATE_COPY.findDebate };

/**
 * The lobby page (GEO-3131). Signed out, drawn from the guest view, listening only (GEO-3129).
 * A guest who signs in stays a guest until the member view loads, so audio never drops.
 */
export function DebateLobbyPage({ lobbyId }: { lobbyId: string }) {
  // The lobby wants the width; the browse sidebar opens collapsed here and as it was elsewhere.
  useBrowseSidebarPageDefault(false);
  const { ready, authenticated } = useGeoChatAuth();
  const signedOut = ready && !authenticated;
  const lobbyQuery = useDebateLobby(lobbyId);
  const [wasGuest, setWasGuest] = React.useState(false);
  if (signedOut && !wasGuest) setWasGuest(true);
  // A member view that failed for good (after the warm-up retries) ends guest mode: the page shows
  // the error and its Retry rather than a guest snapshot nobody is listening on.
  const guest = signedOut || (wasGuest && lobbyQuery.data === undefined && !lobbyQuery.isError);
  const guestQuery = useDebateLobbyGuestView(lobbyId, { enabled: guest, poll: true });
  const guestLobbyData = guestQuery.data?.lobby;
  const guestLobby = React.useMemo(() => (guestLobbyData ? lobbyViewForGuest(guestLobbyData) : null), [guestLobbyData]);
  const memberData = lobbyQuery.data;
  const memberLobby = React.useMemo(() => (memberData ? lobbyViewForMember(memberData) : null), [memberData]);
  const lobby: LobbyPageView | null = guest ? guestLobby : memberLobby;
  const memberViewer = lobby && isMemberView(lobby) ? lobby.viewer : null;
  const admitted = lobby?.access.status === 'admitted';
  const currentUserId = useCurrentGeoChatUserId();
  // The member roster, for a page stepped out by a debate in another tab to read how it went.
  const members = guest ? undefined : memberData?.members;
  const roster = React.useMemo<LobbyPresenceRoster | undefined>(
    () => (members && currentUserId ? { members, viewerId: currentUserId } : undefined),
    [members, currentUserId]
  );
  const presence = useLobbyPresence(
    lobbyId,
    admitted && !guest,
    memberViewer?.stepped_out ?? false,
    memberViewer?.connected ?? false,
    memberViewer?.removed ?? false,
    roster
  );
  const guestSession = useLobbyGuestSession(lobbyId, {
    listen: signedOut && admitted,
    signedIn: authenticated,
    member: memberPath(authenticated, lobbyQuery, presence.state),
  });
  // `debate.lobby_changed` only reaches people inside; until then this page hears opening,
  // arrivals and end through the matchmaking scope's `debate.lobbies_changed`. A guest polls.
  const waitingOutside =
    !guest && lobby !== null && !lobby.viewer.connected && (admitted || lobby.access.status === 'not_yet_open');
  useMatchmakingScope(waitingOutside);
  // Only where the page shows the guest banner, which is how a closed prompt is opened again.
  useLobbySignInPrompt(lobbyId, signedOut && (admitted || lobby?.access.status === 'not_yet_open'));
  const exitHref = useLobbyExitHref();
  const exiting = useExitLobbyWhenOut({
    lobbyId,
    access: lobby?.access ?? null,
    presence: presence.state,
    guestStatus: guestSession.state.status,
    fresh: (guest ? guestQuery : lobbyQuery).isFetchedAfterMount,
    name: lobby?.name ?? null,
    exitHref,
  });

  // Blank while the route changes, rather than a flash of the card being left.
  if (exiting) return <div className="min-h-[calc(100dvh-2.75rem)]" data-testid="lobby-exiting" />;

  return (
    <LobbyGuestProvider value={guest}>
      <LobbyAccess
        lobby={lobby}
        failed={(guest ? guestQuery : lobbyQuery).isError}
        onRetry={() => void (guest ? guestQuery : lobbyQuery).refetch()}
        presence={presence}
        guestSession={guestSession}
        exitHref={exitHref}
      />
    </LobbyGuestProvider>
  );
}

type LobbyGuestSession = ReturnType<typeof useLobbyGuestSession>;

/** Presence states a member join does not come back from by itself. */
const MEMBER_JOIN_FAILED: ReadonlySet<LobbyPresenceState['status']> = new Set([
  'failed',
  'confirm_leave_other',
  'moved',
  'dropped',
  'left',
]);

/** How the signed-in path stands, for a guest session waiting on it. */
export function memberPath(
  signedIn: boolean,
  lobbyQuery: Pick<ReturnType<typeof useDebateLobby>, 'data' | 'isError'>,
  presence: LobbyPresenceState
): LobbyMemberPath {
  if (presence.status === 'joined') return 'joined';
  if (!signedIn) return 'pending';
  if (lobbyQuery.data === undefined) return lobbyQuery.isError ? 'failed' : 'pending';
  if (lobbyQuery.data.access.status !== 'admitted') return 'failed';
  return MEMBER_JOIN_FAILED.has(presence.status) ? 'failed' : 'pending';
}

function LobbyAccess({
  lobby,
  failed,
  onRetry,
  presence,
  guestSession,
  exitHref,
}: {
  lobby: LobbyPageView | null;
  failed: boolean;
  /** Reads the lobby again; a member join follows once it loads. */
  onRetry: () => void;
  presence: ReturnType<typeof useLobbyPresence>;
  guestSession: LobbyGuestSession;
  /** Where leaving goes: the page the lobby was opened from. */
  exitHref: string;
}) {
  const guest = useIsLobbyGuest();
  const purpose = useLobbyRoomPurpose();
  if (!lobby) {
    const call = purpose.purpose === 'call';
    return failed ? (
      <LobbyNotice
        action={
          call ? { href: NavUtils.toSpace(purpose.spaceId), label: CALL_STATE_COPY.backToSpace } : findDebateAction
        }
        onRetry={onRetry}
      >
        {call ? 'Could not open this call.' : 'Could not open this lobby.'}
      </LobbyNotice>
    ) : (
      <LobbyNotice busy>{call ? 'Opening the call…' : 'Opening the lobby…'}</LobbyNotice>
    );
  }

  switch (lobby.access.status) {
    case 'banned':
      return <LobbyBannedCard name={lobby.name} />;
    case 'closed':
      return (
        <LobbyClosedCard
          lobby={lobby}
          ended={lobby.access.reason === 'ended'}
          after={
            <>
              {purpose.purpose === 'call' ? <EndedCallRecording lobby={lobby} /> : null}
              {/* Hosts can still look up who was banned and what was done. */}
              {isMemberView(lobby) && lobby.viewer.role === 'host' ? (
                <div className="w-full max-w-xl">
                  <LobbyHostLists lobby={lobby} />
                </div>
              ) : null}
            </>
          }
        />
      );
    case 'not_yet_open':
      return <NotYetOpen lobby={lobby} />;
    case 'admitted':
      if (guest && guestSession.state.status === 'removed') {
        return (
          <LobbyShell>
            <LobbyTitle lobby={lobby} />
            <LobbyGuestBanner
              lobbyId={lobby.lobby_id}
              message={{
                title: purpose.purpose === 'call' ? LOBBY_COPY.guestRemovedFromCall : LOBBY_COPY.guestRemoved,
                detail: LOBBY_COPY.guestRemovedInvite,
              }}
            />
          </LobbyShell>
        );
      }
      return <AdmittedLobby lobby={lobby} presence={presence} guestSession={guestSession} exitHref={exitHref} />;
  }
}

function NotYetOpen({ lobby }: { lobby: LobbyPageView }) {
  const guest = useIsLobbyGuest();
  const reminder = useDebateLobbyReminder();
  const end = useEndDebateLobby(lobby.lobby_id);
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const reminded = lobby.viewer.reminded;
  // Nobody is connected before it opens, so `viewer.hosting` is false; a stored host may still cancel.
  const canCancel = lobby.viewer.role === 'host';

  // Ticks so the countdown moves; passed in so the compiler sees it change.
  const now = useMinuteNow();
  const hosts = usePreOpenHosts(lobby);
  const hostedBy = hostsLabel(hosts);
  const date = lobbyDateLabel(lobby.starts_at);

  return (
    <LobbyCardFrame className="max-w-[480px] gap-4 p-6" data-testid="debate-lobby">
      <Text as="p" variant="footnoteMedium" color="grey-04">
        {LOBBY_COPY.scheduled}
      </Text>
      <LobbyTitle lobby={lobby} />
      {hostedBy ? (
        <div className="flex items-center gap-2.5">
          <span className="size-6 shrink-0 overflow-hidden rounded-full [&>svg]:size-full">
            <Avatar avatarUrl={hosts[0]!.avatar_cid} value={hosts[0]!.profile_space_id} alt="" size={24} />
          </span>
          <Text as="span" variant="metadata" color="grey-04">
            Hosted by {hostedBy}
          </Text>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 rounded-xl bg-grey-01 p-3">
        {date ? (
          <Text as="p" variant="smallTitle">
            {date}
          </Text>
        ) : null}
        <Text as="p" variant="metadata" color="grey-04">
          {notYetOpenLabel(lobby, now)}
        </Text>
      </div>
      {lobby.reminder_count > 0 ? (
        <Text as="p" variant="metadata" color="grey-04">
          {goingLabel(lobby.reminder_count)}
        </Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {guest ? null : (
          <HubPillButton
            variant={reminded ? 'secondary' : 'primary'}
            analyticsLabel={reminded ? 'Lobby reminded' : 'Lobby remind me'}
            aria-pressed={reminded}
            pending={reminder.isPending}
            onClick={() => reminder.mutate({ lobbyId: lobby.lobby_id, reminded: !reminded })}
          >
            {rsvpLabel(reminded)}
          </HubPillButton>
        )}
        <FindDebateLink />
        {canCancel ? (
          confirmingCancel ? (
            <>
              <HubPillButton
                variant="primary"
                analyticsLabel="Lobby cancel confirm"
                pending={end.isPending}
                pendingLabel="Cancelling…"
                onClick={() => end.mutate()}
              >
                Cancel for everyone
              </HubPillButton>
              <HubPillButton analyticsLabel="Lobby cancel back" onClick={() => setConfirmingCancel(false)}>
                Keep it
              </HubPillButton>
            </>
          ) : (
            <HubPillButton analyticsLabel="Lobby cancel" onClick={() => setConfirmingCancel(true)}>
              Cancel lobby
            </HubPillButton>
          )
        ) : null}
      </div>
      {end.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(end.error, 'Could not cancel the lobby. Try again.')}
        </Text>
      ) : null}
      {reminder.isError ? (
        <Text as="p" variant="footnote" color="red-01">
          {lobbyErrorMessage(reminder.error, RSVP_FAILED)}
        </Text>
      ) : null}
      {guest ? (
        <LobbyGuestBanner
          lobbyId={lobby.lobby_id}
          message={{ title: LOBBY_COPY.guestBeforeOpen, detail: LOBBY_GUEST_COPY.notListening }}
        />
      ) : null}
    </LobbyCardFrame>
  );
}

function AdmittedLobby({
  lobby,
  presence,
  guestSession,
  exitHref,
}: {
  lobby: LobbyPageView;
  presence: ReturnType<typeof useLobbyPresence>;
  guestSession: LobbyGuestSession;
  exitHref: string;
}) {
  const { state, join, leave, leaveSteppedOut, connectionId, setVoiceConnected, voiceAwayAt } = presence;
  const purpose = useLobbyRoomPurpose();

  // Removed before this visit, or unbanned since. Dropped while in the lobby, and Leave, take the
  // page back to where it was opened from (`useExitLobbyWhenOut`) before this renders.
  if (state.status === 'dropped' && state.reason === 'removed') {
    return (
      <LobbyRemovedNotice
        onRejoin={() => void join(false, true)}
        unbanned={isMemberView(lobby) && lobby.viewer.last_moderation?.action === 'unban'}
      />
    );
  }

  if (state.status === 'confirm_leave_other') {
    return (
      <ConfirmLeaveOtherLobby
        lobby={lobby}
        otherLobbyId={state.otherLobbyId}
        onJoin={() => void join(true, state.rejoin ?? false)}
      />
    );
  }

  if (state.status === 'moved')
    return <MovedToOtherLobby lobby={lobby} otherLobbyId={state.otherLobbyId} onJoin={join} />;

  const room = {
    lobby,
    state,
    onRetry: () => void join(false),
    onLeave: () => void (state.status === 'stepped_out' ? leaveSteppedOut() : leave()),
    voice: { connectionId, setVoiceConnected, awayAt: voiceAwayAt ?? lobby.viewer.voice_away_at },
    guestSession,
    exitHref,
  };
  // A space call (GEO-3419): no lobby analytics, schedule or queued debate requests.
  if (purpose.purpose === 'call') return <CallRoom {...room} />;

  return (
    <LobbyAnalyticsScope lobby={lobby}>
      <LobbyScheduleProvider lobby={lobby}>
        <LobbyQueuedRequestProvider lobby={lobby} joined={state.status === 'joined'}>
          <LobbyRoom {...room} />
        </LobbyQueuedRequestProvider>
      </LobbyScheduleProvider>
    </LobbyAnalyticsScope>
  );
}

/** Joining here would leave the lobby the viewer is in; asks first. */
function ConfirmLeaveOtherLobby({
  lobby,
  otherLobbyId,
  onJoin,
}: {
  lobby: LobbyPageView;
  otherLobbyId: string | null;
  onJoin: () => void;
}) {
  const other = useDebateLobby(otherLobbyId ?? '', otherLobbyId !== null).data;
  const calls = useIsCallRoom() || other?.purpose === 'call';

  return (
    <LobbyShell>
      <Text as="h1" variant="smallTitle">
        {LOBBY_COPY.leaveOther(other?.name ?? null, other?.purpose === 'call' ? 'call' : 'lobby')}
      </Text>
      <Text as="p" variant="metadata" color="grey-04">
        {calls ? LOBBY_COPY.oneRoom(lobby.name) : LOBBY_COPY.oneLobby(lobby.name)}
      </Text>
      <div className="flex flex-wrap gap-2">
        {/* Stay goes back to the other lobby when there is one to go to. */}
        <Link
          href={otherLobbyId ? roomPath(otherLobbyId, other) : NavUtils.toExplore()}
          onClick={() => otherLobbyId && markLobbyEntry(otherLobbyId, 'other_lobby')}
          className={hubPillClassName('secondary')}
        >
          Stay
        </Link>
        <HubPillButton variant="primary" analyticsLabel="Lobby join leaving other" onClick={onJoin}>
          Leave and join
        </HubPillButton>
      </div>
    </LobbyShell>
  );
}

/** The other room's page: a space call's own, else the lobby's. */
function roomPath(id: string, view: Pick<DebateLobbyView, 'purpose' | 'call'> | undefined) {
  return view?.purpose === 'call' && view.call ? spaceCallPath(view.call.space_id, id) : debateRoomPath(id);
}

/** Another tab joined a different lobby, which took this tab out of this one. */
function MovedToOtherLobby({
  lobby,
  otherLobbyId,
  onJoin,
}: {
  lobby: LobbyPageView;
  otherLobbyId: string | null;
  onJoin: () => Promise<void>;
}) {
  const other = useDebateLobby(otherLobbyId ?? '', otherLobbyId !== null).data;

  return (
    <LobbyShell>
      <LobbyTitle lobby={lobby} />
      <Text as="p" variant="metadata">
        {LOBBY_COPY.movedToOther(other?.name ?? null, other?.purpose === 'call' ? 'call' : 'lobby')}
      </Text>
      <div className="flex flex-wrap gap-2">
        {otherLobbyId ? (
          <Link
            href={roomPath(otherLobbyId, other)}
            onClick={() => markLobbyEntry(otherLobbyId, 'other_lobby')}
            className={hubPillClassName('primary')}
          >
            Go to that lobby
          </Link>
        ) : null}
        {/* Asks before leaving the other lobby, like any join while in one. */}
        <HubPillButton analyticsLabel="Lobby join here instead" onClick={() => void onJoin()}>
          Join here instead
        </HubPillButton>
      </div>
    </LobbyShell>
  );
}

function LobbyRoom({
  lobby,
  state,
  onRetry,
  onLeave,
  voice,
  guestSession,
  exitHref,
}: {
  lobby: LobbyPageView;
  state: LobbyPresenceState;
  onRetry: () => void;
  onLeave: () => void;
  voice: { connectionId: string; setVoiceConnected: (connected: boolean) => void; awayAt: string | null };
  guestSession: LobbyGuestSession;
  exitHref: string;
}) {
  const guest = useIsLobbyGuest();
  const currentUserId = useCurrentGeoChatUserId();
  const { authenticated } = useGeoChatAuth();
  const phone = useIsPhoneLayout();
  // The viewer's own toggle, as the availability pill and People tab read it, ahead of the roster's.
  // A member read: off for a guest, including one signed in while the member view loads.
  const activityQuery = useDebateActivity(authenticated && !guest);
  const activity = activityQuery.data;
  const ownAvailable = activity?.available_to_debate;
  const ownRematch = activity?.rematch ?? null;
  const queuedRequest = useLobbyQueuedRequest();
  const [tab, setTab] = React.useState<LobbyPhoneTab>('people');

  const showClaims = state.status === 'joined' || guest;
  // Per-person disagreements ride on the claims read the claims panel already makes.
  const disagreements = useDebateLobbyClaims(lobby.lobby_id, showClaims).data?.disagreements ?? null;
  const highlights = useLobbyHighlights(lobby.lobby_id, phone && showClaims).data;
  // The desktop panel always shows the claims, so what arrives there is seen; only a phone on
  // People builds up a mark.
  const claimsMark = useClaimsTabMark(highlights, !phone || tab === 'aside', lobby.claim_lists);
  const availability = guest ? null : <HubHeaderControls analyticsSurface="lobby" />;

  return (
    <LobbyRoomShell
      lobby={lobby}
      state={state}
      onRetry={onRetry}
      onLeave={onLeave}
      voice={voice}
      guestSession={guestSession}
      exitHref={exitHref}
      before={
        ownRematch && !guest ? (
          <EndPickerLeftBehind
            joined={state.status === 'joined'}
            session={ownRematch}
            checkedAt={activityQuery.dataUpdatedAt}
          />
        ) : null
      }
      header={<LobbyHeader lobby={lobby} phone={phone} availability={phone ? null : availability} />}
      belowHeader={!guest && state.status === 'joined' ? <LobbyScheduledRequests lobby={lobby} /> : null}
      people={
        <LobbyPeople lobby={lobby} viewerId={currentUserId} ownAvailable={ownAvailable} disagreements={disagreements} />
      }
      aside={{
        tab: 'Claims',
        label: 'Claims in the room',
        mark: claimsMark,
        content: <LobbyClaimsArea lobby={lobby} />,
      }}
      tab={tab}
      onTab={setTab}
      availability={availability}
      queuedOutcome={queuedRequest.outcome}
      onDismissQueuedOutcome={queuedRequest.dismissOutcome}
    />
  );
}

function LobbyTitle({ lobby }: { lobby: LobbyPageView }) {
  return (
    <Text as="h1" variant="mediumTitle">
      {lobby.name}
    </Text>
  );
}

function LobbyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] justify-center px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-4" data-testid="debate-lobby">
        {children}
      </div>
    </div>
  );
}

function LobbyNotice({
  children,
  busy = false,
  action,
  onRetry,
}: {
  children: React.ReactNode;
  busy?: boolean;
  action?: { href: string; label: string };
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        {busy && <Spinner />}
        <Text color="grey-04">{children}</Text>
        {onRetry ? (
          <HubPillButton analyticsLabel="Lobby retry open" onClick={onRetry}>
            Try again
          </HubPillButton>
        ) : null}
        {action && (
          <Link href={action.href} className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white">
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
