'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';
import { useBrowseSidebarPageDefault } from '~/core/state/browse-sidebar-state';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import type { DebateLobbyMember } from '../api';
import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubHeaderControls } from '../matchmaking/hub-header-controls';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { HUB_SCROLL_SELECTOR, HubScrollSelectorProvider } from '../matchmaking/hub-scroll';
import { debateRoomPath } from '../rooms/room-routes';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import {
  type LobbyPresenceState,
  MAX_TIMEOUT_MS,
  useDebateLobby,
  useDebateLobbyReminder,
  useEndDebateLobby,
  useLobbyPresence,
} from './hooks';
import { markLobbyEntry } from './lobby-analytics';
import { LobbyClaimsArea } from './lobby-claims-area';
import { useClaimsTabMark } from './lobby-claims-mark';
import { LobbyControlBar, LobbyHandControl } from './lobby-control-bar';
import {
  hostAfterChange,
  hostWhoLeft,
  hostsLabel,
  isAlone,
  isHosting,
  lobbyDateLabel,
  lobbyErrorMessage,
  notYetOpenLabel,
  remindedLabel,
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
import { LobbyHostLists, LobbyRemovedNotice, useModerationNotice } from './lobby-moderation';
import { type LobbyGuestNotice, type LobbyHandoffNotice, LobbyNotices, LobbyToast } from './lobby-notices';
import { LobbyQueuedRequestProvider, useLobbyQueuedRequest } from './lobby-queued-request';
import { useDebateLobbyClaims } from './lobby-room-claims-hooks';
import { LobbyPeople } from './lobby-roster';
import { LobbySlot, LobbySlotsProvider, useLobbySlotTargets } from './lobby-slots';
import {
  FindDebateLink,
  LOBBY_STATE_COPY,
  LobbyBannedCard,
  LobbyCardFrame,
  LobbyClosedCard,
  LobbyEmptyRoom,
} from './lobby-state-cards';
import { type LobbyPageView, isMemberView, lobbyViewForGuest, lobbyViewForMember } from './lobby-view';
import {
  LobbyGuestVoice,
  LobbyVoice,
  type LobbyVoiceStates,
  LobbyVoiceStatesProvider,
  NO_LOBBY_VOICE,
  useLobbyVoiceStates,
} from './lobby-voice';
import { useMinuteNow } from './use-minute-now';

const HANDOFF_NOTICE_MS = 8_000;
const NO_MODERATION = { last_moderation: null };

export const LOBBY_COPY = {
  leaveOther: (name: string | null) => (name ? `Leave ${name}?` : 'Leave your other lobby?'),
  oneLobby: (name: string) => `You can be in one lobby at a time. Joining ${name} will leave it.`,
  scheduled: 'Debate lobby · scheduled',
  guestBeforeOpen: 'No account? You can still join and listen when it opens.',
  steppedOut: 'You stepped out to debate. You’re still on the roster.',
  movedToOther: (name: string | null) => `You joined ${name ?? 'another lobby'} in another tab.`,
  guestRemoved: 'A host removed you from this lobby.',
  guestRemovedInvite: 'Create an account to come back and take part.',
  guestElsewhere: 'You’re listening in another tab.',
  guestListeningOff: 'Listening without an account has been turned off for this lobby. Create an account to join.',
} as const;

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
  const presence = useLobbyPresence(
    lobbyId,
    admitted && !guest,
    memberViewer?.stepped_out ?? false,
    memberViewer?.connected ?? false,
    memberViewer?.removed ?? false
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

  return (
    <LobbyGuestProvider value={guest}>
      <LobbyAccess
        lobby={lobby}
        failed={(guest ? guestQuery : lobbyQuery).isError}
        onRetry={() => void (guest ? guestQuery : lobbyQuery).refetch()}
        presence={presence}
        guestSession={guestSession}
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
}: {
  lobby: LobbyPageView | null;
  failed: boolean;
  /** Reads the lobby again; a member join follows once it loads. */
  onRetry: () => void;
  presence: ReturnType<typeof useLobbyPresence>;
  guestSession: LobbyGuestSession;
}) {
  const guest = useIsLobbyGuest();
  if (!lobby) {
    return failed ? (
      <LobbyNotice action={findDebateAction} onRetry={onRetry}>
        Could not open this lobby.
      </LobbyNotice>
    ) : (
      <LobbyNotice busy>Opening the lobby…</LobbyNotice>
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
            // Hosts can still look up who was banned and what was done.
            isMemberView(lobby) && lobby.viewer.role === 'host' ? (
              <div className="w-full max-w-xl">
                <LobbyHostLists lobby={lobby} />
              </div>
            ) : null
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
              message={{ title: LOBBY_COPY.guestRemoved, detail: LOBBY_COPY.guestRemovedInvite }}
            />
          </LobbyShell>
        );
      }
      return <AdmittedLobby lobby={lobby} presence={presence} guestSession={guestSession} />;
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
          {remindedLabel(lobby.reminder_count)}
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
            {reminded ? 'Reminded' : 'Remind me'}
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
          {lobbyErrorMessage(reminder.error, 'Could not update your reminder. Try again.')}
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
}: {
  lobby: LobbyPageView;
  presence: ReturnType<typeof useLobbyPresence>;
  guestSession: LobbyGuestSession;
}) {
  const { state, join, leave, leaveSteppedOut, connectionId, setVoiceConnected, voiceAwayAt } = presence;

  // Until the refetch moves the page to the lobby's new access.
  if (state.status === 'dropped') {
    if (state.reason === 'removed') {
      return (
        <LobbyRemovedNotice
          onRejoin={() => void join(false, true)}
          unbanned={isMemberView(lobby) && lobby.viewer.last_moderation?.action === 'unban'}
        />
      );
    }
    return state.reason === 'banned' ? <LobbyBannedCard name={lobby.name} /> : <LobbyClosedCard lobby={lobby} ended />;
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

  if (state.status === 'left') {
    return (
      <LobbyShell>
        <LobbyTitle lobby={lobby} />
        <Text as="p" variant="metadata" color="grey-04">
          You left this lobby.
        </Text>
        <div className="flex flex-wrap gap-2">
          <HubPillButton variant="primary" analyticsLabel="Lobby rejoin" onClick={() => void join(false)}>
            Rejoin
          </HubPillButton>
          <FindDebateLink />
        </div>
      </LobbyShell>
    );
  }

  return (
    <LobbyQueuedRequestProvider lobby={lobby} joined={state.status === 'joined'}>
      <LobbyRoom
        lobby={lobby}
        state={state}
        onRetry={() => void join(false)}
        onLeave={() => void (state.status === 'stepped_out' ? leaveSteppedOut() : leave())}
        voice={{ connectionId, setVoiceConnected, awayAt: voiceAwayAt ?? lobby.viewer.voice_away_at }}
        guestSession={guestSession}
      />
    </LobbyQueuedRequestProvider>
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

  return (
    <LobbyShell>
      <Text as="h1" variant="smallTitle">
        {LOBBY_COPY.leaveOther(other?.name ?? null)}
      </Text>
      <Text as="p" variant="metadata" color="grey-04">
        {LOBBY_COPY.oneLobby(lobby.name)}
      </Text>
      <div className="flex flex-wrap gap-2">
        {/* Stay goes back to the other lobby when there is one to go to. */}
        <Link
          href={otherLobbyId ? debateRoomPath(otherLobbyId) : NavUtils.toExplore()}
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
        {LOBBY_COPY.movedToOther(other?.name ?? null)}
      </Text>
      <div className="flex flex-wrap gap-2">
        {otherLobbyId ? (
          <Link
            href={debateRoomPath(otherLobbyId)}
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
}: {
  lobby: LobbyPageView;
  state: LobbyPresenceState;
  onRetry: () => void;
  onLeave: () => void;
  voice: { connectionId: string; setVoiceConnected: (connected: boolean) => void; awayAt: string | null };
  guestSession: LobbyGuestSession;
}) {
  const guest = useIsLobbyGuest();
  const currentUserId = useCurrentGeoChatUserId();
  const { authenticated } = useGeoChatAuth();
  const phone = useIsPhoneLayout();
  // The viewer's own toggle, as the availability pill and People tab read it, ahead of the roster's.
  // A member read: off for a guest, including one signed in while the member view loads.
  const ownAvailable = useDebateActivity(authenticated && !guest).data?.available_to_debate;
  const handoff = useHandoffNotice(lobby);
  // Member-only parts read this; a guest's view never reaches them.
  const memberLobby = isMemberView(lobby) ? lobby : null;
  const moderationNotice = useModerationNotice(memberLobby?.viewer ?? NO_MODERATION);
  const queuedRequest = useLobbyQueuedRequest();
  const slots = useLobbySlotTargets();
  const [tab, setTab] = React.useState<LobbyPhoneTab>('people');
  // The guest room, a sibling of the member room so the handover can drop it mid-call.
  const [guestVoiceStates, setGuestVoiceStates] = React.useState<LobbyVoiceStates>(NO_LOBBY_VOICE);
  const guestVoice =
    guestSession.state.status === 'listening' || guestSession.state.status === 'handingOver'
      ? guestSession.state.session.voice
      : null;
  // An ended guest session in a lobby that is still open means guests were turned off here. Read
  // after a fresh guest view, so a lobby that ended shows its closed notice instead.
  const { dataUpdatedAt: guestViewAt, refetch: refetchGuestView } = useDebateLobbyGuestView(lobby.lobby_id, {
    enabled: guest,
  });
  const guestEnded = guest && guestSession.state.status === 'ended';
  const [guestEndedAt, setGuestEndedAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!guestEnded) return;
    setGuestEndedAt(Date.now());
    void refetchGuestView();
  }, [guestEnded, refetchGuestView]);
  const guestNotice: LobbyGuestNotice | null = !guest
    ? null
    : guestSession.state.status === 'refused'
      ? { message: guestSession.state.message, retry: guestSession.state.retryable ? 'Try again' : null }
      : guestSession.state.status === 'superseded'
        ? { message: LOBBY_COPY.guestElsewhere, retry: 'Listen here' }
        : guestEnded && guestEndedAt !== null && guestViewAt >= guestEndedAt
          ? { message: LOBBY_COPY.guestListeningOff, retry: null }
          : null;
  // One automatic reconnect per page for a guest join dropped before it connected.
  const guestAutoRetryLeftRef = React.useRef(true);
  const { reconnect: reconnectGuest } = guestSession;
  const autoReconnectGuest = React.useCallback(() => {
    if (!guestAutoRetryLeftRef.current) return false;
    guestAutoRetryLeftRef.current = false;
    reconnectGuest();
    return true;
  }, [reconnectGuest]);

  // Only while in the lobby: stepping out or leaving unmounts it, which disconnects.
  const inVoice = state.status === 'joined' || state.status === 'joining';
  const showClaims = state.status === 'joined' || guest;
  // Per-person disagreements ride on the claims read the claims panel already makes.
  const disagreements = useDebateLobbyClaims(lobby.lobby_id, showClaims).data?.disagreements ?? null;
  const highlights = useLobbyHighlights(lobby.lobby_id, phone && showClaims).data;
  const claimsMark = useClaimsTabMark(highlights, phone && tab === 'claims', lobby.claim_lists);
  const tabbed = phone && showClaims;
  const tabIds = useTabIds();
  const onPeopleTab = !phone || !showClaims || tab === 'people';
  const onClaimsTab = !phone || tab === 'claims';
  const alone = showClaims && isAlone(lobby, guest ? null : currentUserId, guest, guestVoice !== null);

  // The empty-room block stands in for an empty roster's own line.
  const people =
    alone && lobby.members.length === 0 ? null : (
      <LobbyPeople lobby={lobby} viewerId={currentUserId} ownAvailable={ownAvailable} disagreements={disagreements} />
    );
  const availability = guest ? null : <HubHeaderControls analyticsSurface="lobby" />;
  const handControl =
    memberLobby &&
    state.status === 'joined' &&
    memberLobby.viewer.role === 'listener' &&
    !memberLobby.viewer.hosting ? (
      <LobbyHandControl lobby={memberLobby} />
    ) : null;
  const leave = guest ? (
    <Link href={NavUtils.toExplore()} aria-label="Leave lobby" className={hubPillClassName('secondary', 'md:h-10')}>
      <LeaveLabel />
    </Link>
  ) : (
    <HubPillButton analyticsLabel="Lobby leave" aria-label="Leave lobby" onClick={onLeave} className="md:h-10">
      <LeaveLabel />
    </HubPillButton>
  );

  // On a desktop the people and the claims sit side by side, so each column scrolls on its own
  // under a fixed header and bar; scrolling the page would carry the speakers off with the claims.
  // A phone shows one tab at a time and keeps scrolling the page.
  const columns = showClaims && !phone;
  const columnScroll = columns && 'overflow-y-auto overscroll-contain';

  return (
    <LobbySlotsProvider value={slots.targets}>
      <div
        className={cx('flex flex-col', columns ? 'h-[calc(100dvh-2.75rem)]' : 'min-h-[calc(100dvh-2.75rem)]')}
        data-testid="debate-lobby"
      >
        <LobbyHeader lobby={lobby} phone={phone} availability={phone ? null : availability} />
        {tabbed ? <LobbyPhoneTabs ids={tabIds} tab={tab} onTab={setTab} claimsMark={claimsMark} /> : null}

        <div
          className={cx(
            'flex-1',
            columns &&
              'grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(320px,420px)] grid-rows-[minmax(0,1fr)] items-stretch'
          )}
        >
          <section
            {...(tabbed
              ? { role: 'tabpanel', id: tabIds.people.panel, 'aria-labelledby': tabIds.people.tab }
              : { 'aria-label': 'People in the lobby' })}
            hidden={!onPeopleTab}
            className={cx('flex min-w-0 flex-col gap-5 px-8 py-5 md:gap-3.5 md:px-4 md:py-3.5', columnScroll)}
          >
            <LobbyRoomStatus state={state} onRetry={onRetry} />
            {alone ? <LobbyEmptyRoom lobby={lobby} signedIn={!guest} /> : null}
            <LobbyVoiceStatesProvider value={guestVoiceStates}>
              {guestVoice ? (
                <LobbyGuestVoice
                  key={guestVoice.token}
                  token={guestVoice}
                  onStates={setGuestVoiceStates}
                  onReconnect={guestSession.reconnect}
                  onAutoReconnect={autoReconnectGuest}
                  onRemoved={guestSession.checkNow}
                  quiet={inVoice}
                />
              ) : null}
              {memberLobby && inVoice ? (
                <LobbyVoice
                  lobby={memberLobby}
                  connectionId={voice.connectionId}
                  joined={state.status === 'joined'}
                  currentUserId={currentUserId}
                  onConnectedChange={voice.setVoiceConnected}
                  onAudible={guestVoice ? guestSession.roomDone : undefined}
                  onUnavailable={guestVoice ? guestSession.roomDone : undefined}
                >
                  <VoiceAwayWarning awayAt={voice.awayAt} />
                  {people}
                </LobbyVoice>
              ) : (
                people
              )}
            </LobbyVoiceStatesProvider>
          </section>

          {showClaims ? (
            <motion.aside
              // Framer measures its layout animations (the tab underline, Explore's list) through it.
              layoutScroll
              {...(tabbed
                ? { role: 'tabpanel', id: tabIds.claims.panel, 'aria-labelledby': tabIds.claims.tab }
                : { 'aria-label': 'Claims in the room' })}
              hidden={!onClaimsTab}
              // Its lists page and read cards against this box, only while it scrolls: a box that does
              // not would hold every row in range at once. The provider rebuilds their observers when
              // the breakpoint flips it, as the claims stay mounted across that.
              data-debates-hub-scroll={columns ? '' : undefined}
              className={cx(
                'flex min-w-0 flex-col gap-3 border-l border-grey-02 px-4 py-5 md:border-l-0 md:py-3',
                columnScroll
              )}
            >
              <HubScrollSelectorProvider value={columns ? HUB_SCROLL_SELECTOR : undefined}>
                <LobbyClaimsArea lobby={lobby} />
              </HubScrollSelectorProvider>
            </motion.aside>
          ) : null}
        </div>

        <LobbyControlBar
          controlsRef={slots.controlsRef}
          hand={handControl}
          availability={phone ? availability : null}
          showHint={!guest}
          leave={leave}
          banner={guest ? <LobbyGuestBanner lobbyId={lobby.lobby_id} listening={guestVoiceStates.connected} /> : null}
          notices={
            <LobbyNotices
              noticesRef={slots.noticesRef}
              handoff={handoff}
              queuedOutcome={queuedRequest.outcome}
              onDismissQueuedOutcome={queuedRequest.dismissOutcome}
              moderationNotice={moderationNotice}
              guestNotice={guestNotice}
              guestConnecting={guest && guestSession.state.status === 'starting'}
              onGuestRetry={authenticated ? null : guestSession.retry}
            />
          }
        />
      </div>
    </LobbySlotsProvider>
  );
}

type LobbyPhoneTab = 'people' | 'claims';

function LeaveLabel() {
  return (
    <>
      <span className="md:hidden">Leave lobby</span>
      <span className="hidden md:inline">Leave</span>
    </>
  );
}

type TabIds = Record<LobbyPhoneTab, { tab: string; panel: string }>;

function useTabIds(): TabIds {
  const base = React.useId();
  return {
    people: { tab: `${base}-people-tab`, panel: `${base}-people-panel` },
    claims: { tab: `${base}-claims-tab`, panel: `${base}-claims-panel` },
  };
}

const PHONE_TABS: { id: LobbyPhoneTab; label: string }[] = [
  { id: 'people', label: 'People' },
  { id: 'claims', label: 'Claims' },
];

/**
 * Phone: People and Claims, with a dot on Claims for a room vote or highlight not seen yet. Arrow
 * keys, Home and End move between tabs; only the selected one is in the tab order.
 */
function LobbyPhoneTabs({
  ids,
  tab,
  onTab,
  claimsMark,
}: {
  ids: TabIds;
  tab: LobbyPhoneTab;
  onTab: (tab: LobbyPhoneTab) => void;
  claimsMark: boolean;
}) {
  const select = (index: number) => {
    const next = PHONE_TABS[(index + PHONE_TABS.length) % PHONE_TABS.length]!;
    onTab(next.id);
    document.getElementById(ids[next.id].tab)?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const current = PHONE_TABS.findIndex(item => item.id === tab);
    const target =
      event.key === 'ArrowRight'
        ? current + 1
        : event.key === 'ArrowLeft'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? PHONE_TABS.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div role="tablist" aria-label="Lobby" onKeyDown={onKeyDown} className="mx-4 mt-2 flex border-b border-grey-02">
      {PHONE_TABS.map(item => (
        <button
          key={item.id}
          id={ids[item.id].tab}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          aria-controls={ids[item.id].panel}
          tabIndex={tab === item.id ? 0 : -1}
          {...hubAnalyticsAttributes(`Lobby ${item.label} tab`, 'navigate_lobby_claims')}
          onClick={() => onTab(item.id)}
          className={cx(
            'inline-flex flex-1 items-center justify-center gap-1.5 pb-2 text-[17px] leading-[22px] font-semibold',
            tab === item.id ? 'text-text shadow-[inset_0_-1px_0_var(--color-text)]' : 'text-grey-04'
          )}
        >
          {item.label}
          {item.id === 'claims' && claimsMark ? (
            <span className="size-1.5 rounded-full bg-ctaPrimary" aria-label="New" role="img" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** Stepped out, a failed join, or joining: above the people, where the room would be. */
function LobbyRoomStatus({ state, onRetry }: { state: LobbyPresenceState; onRetry: () => void }) {
  if (state.status === 'stepped_out') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Text as="p" variant="footnote" color="text">
          {LOBBY_COPY.steppedOut}
        </Text>
        <HubPillButton variant="primary" analyticsLabel="Lobby back to the room" onClick={onRetry}>
          Back to the room
        </HubPillButton>
      </div>
    );
  }
  if (state.status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <Text as="p" variant="footnote" color="red-01">
          {state.message}
        </Text>
        <HubPillButton analyticsLabel="Lobby retry join" onClick={onRetry}>
          Try again
        </HubPillButton>
      </div>
    );
  }
  if (state.status === 'joining') {
    return (
      <Text as="p" variant="footnote" color="grey-04">
        Joining…
      </Text>
    );
  }
  return null;
}

/** "X left. Y is now hosting." for a few seconds after hosting changes hands. */
export function useHandoffNotice(lobby: Pick<LobbyPageView, 'hosts_changed_at' | 'members'>) {
  const seenRef = React.useRef<string | null | undefined>(undefined);
  // The last hosts seen; the views between a host leaving and the handoff have none.
  const lastHostsRef = React.useRef<DebateLobbyMember[]>([]);
  const [notice, setNotice] = React.useState<LobbyHandoffNotice | null>(null);

  React.useEffect(() => {
    const next = hostAfterChange(seenRef.current, lobby);
    seenRef.current = lobby.hosts_changed_at;
    if (next) setNotice({ host: next, left: hostWhoLeft(lastHostsRef.current, lobby) });
    const hosts = lobby.members.filter(isHosting);
    if (hosts.length > 0) lastHostsRef.current = hosts;
  }, [lobby]);

  // Keyed on the notice, so a later roster change cannot cancel the clear.
  React.useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), HANDOFF_NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [notice]);

  return notice;
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

/** How long before `voice_away_at` the warning shows. */
const VOICE_AWAY_WARNING_MS = 2 * 60_000;

/**
 * Voice keeps a quiet listener available only with recent input; any click counts as input, so
 * the button needs no handler of its own.
 */
function VoiceAwayWarning({ awayAt }: { awayAt: string | null }) {
  const { connected } = useLobbyVoiceStates();
  const at = awayAt ? Date.parse(awayAt) : Number.NaN;
  const [now, setNow] = React.useState(() => Date.now());
  // Hidden on the tap until the next heartbeat brings a later `voice_away_at`.
  const [ackedAt, setAckedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (Number.isNaN(at)) return;
    const until = at - VOICE_AWAY_WARNING_MS - Date.now();
    if (until <= 0) return;
    const timeout = setTimeout(() => setNow(Date.now()), Math.min(until, MAX_TIMEOUT_MS));
    return () => clearTimeout(timeout);
  }, [at]);

  if (!connected || Number.isNaN(at) || ackedAt === at || now < at - VOICE_AWAY_WARNING_MS) return null;
  return (
    <LobbySlot name="notices">
      <LobbyToast
        action={
          <HubPillButton
            analyticsLabel="Lobby voice still here"
            onClick={() => setAckedAt(at)}
            className="border-white bg-white"
          >
            I’m still here
          </HubPillButton>
        }
      >
        {now >= at ? 'You show as away to others.' : 'You’ll show as away soon unless you’re still here.'}
      </LobbyToast>
    </LobbySlot>
  );
}
