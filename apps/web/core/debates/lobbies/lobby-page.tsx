'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Spinner } from '~/design-system/spinner';
import { Text } from '~/design-system/text';

import { type DebateLobbyMember, dashlessId } from '../api';
import { MicrophoneIcon } from '../debate-room-controls';
import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useMatchmakingScope } from '../matchmaking/hooks';
import { HubHeaderControls } from '../matchmaking/hub-header-controls';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { sameId } from '../rooms/room-presence';
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
import { lobbyShareUrl, markLobbyEntry } from './lobby-analytics';
import { LobbyClaimsArea } from './lobby-claims-area';
import { LobbyDebatePairs } from './lobby-debate-pairs';
import { LobbyDebateSubject } from './lobby-debate-subject';
import {
  ROLE_LABEL,
  STATUS_LABEL,
  debatingCount,
  debatingLabel,
  hereLabel,
  hostAfterChange,
  hostsLabel,
  isHosting,
  lobbyErrorMessage,
  memberStatus,
  notYetOpenLabel,
  personName,
  remindedLabel,
  rosterOrder,
} from './lobby-format';
import { LobbyGuestBanner, LobbyGuestCount } from './lobby-guest';
import {
  LobbyGuestProvider,
  type LobbyMemberPath,
  useDebateLobbyGuestView,
  useLobbyGuestSession,
} from './lobby-guest-hooks';
import { LobbyMemberMenu } from './lobby-member-actions';
import { LobbyHandControl, LobbyHostLists, LobbyRemovedNotice, useModerationNotice } from './lobby-moderation';
import { LobbyPersonName } from './lobby-people';
import { LobbyQueuedRequestProvider, useLobbyQueuedRequest } from './lobby-queued-request';
import { LobbyRequestDebate } from './lobby-request-debate';
import { type LobbyPageView, isMemberView, lobbyViewForGuest, lobbyViewForMember } from './lobby-view';
import {
  LobbyGuestVoice,
  LobbyVoice,
  type LobbyVoiceStates,
  LobbyVoiceStatesProvider,
  NO_LOBBY_VOICE,
  useLobbyVoiceStates,
} from './lobby-voice';

const HANDOFF_NOTICE_MS = 8_000;
const NO_MODERATION = { last_moderation: null };

export const LOBBY_COPY = {
  unavailable: 'Lobbies are not available right now.',
  banned: 'You can’t join this lobby.',
  bannedFrom: (name: string) => `A host has blocked you from ${name}.`,
  ended: 'This lobby has ended.',
  closed: 'This lobby has closed.',
  findDebate: 'Find a debate',
  otherLobby: 'You’re in another lobby. Joining this one leaves it.',
  removed: 'You were removed from this lobby.',
  steppedOut: 'You stepped out to debate. You’re still on the roster.',
  movedToOther: (name: string | null) => `You joined ${name ?? 'another lobby'} in another tab.`,
  guestRemoved: 'A host removed you from this lobby.',
  guestRemovedInvite: 'Create an account to come back and take part.',
} as const;

/** `/debate/{id}` when the room is a lobby and `lobbyJoining` is off. */
export function LobbiesUnavailable() {
  return <LobbyNotice action={findDebateAction}>{LOBBY_COPY.unavailable}</LobbyNotice>;
}

const findDebateAction = { href: NavUtils.toExplore(), label: LOBBY_COPY.findDebate };

/**
 * The lobby page (GEO-3131). Signed out, drawn from the guest view, listening only (GEO-3129).
 * A guest who signs in stays a guest until the member view loads, so audio never drops.
 */
export function DebateLobbyPage({ lobbyId }: { lobbyId: string }) {
  const { ready, authenticated } = useGeoChatAuth();
  const signedOut = ready && !authenticated;
  const lobbyQuery = useDebateLobby(lobbyId);
  const [wasGuest, setWasGuest] = React.useState(false);
  if (signedOut && !wasGuest) setWasGuest(true);
  const guest = signedOut || (wasGuest && lobbyQuery.data === undefined);
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

  return (
    <LobbyGuestProvider value={guest}>
      <LobbyAccess
        lobby={lobby}
        failed={(guest ? guestQuery : lobbyQuery).isError}
        guest={guest}
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
  guest,
  presence,
  guestSession,
}: {
  lobby: LobbyPageView | null;
  failed: boolean;
  guest: boolean;
  presence: ReturnType<typeof useLobbyPresence>;
  guestSession: LobbyGuestSession;
}) {
  if (!lobby) {
    return failed ? (
      <LobbyNotice action={findDebateAction}>Could not open this lobby.</LobbyNotice>
    ) : (
      <LobbyNotice busy>Opening the lobby…</LobbyNotice>
    );
  }

  switch (lobby.access.status) {
    case 'banned':
      return (
        <LobbyNotice action={findDebateAction}>
          {LOBBY_COPY.banned} {LOBBY_COPY.bannedFrom(lobby.name)}
        </LobbyNotice>
      );
    case 'closed': {
      const notice = (
        <LobbyNotice action={findDebateAction}>
          {lobby.access.reason === 'ended' ? LOBBY_COPY.ended : LOBBY_COPY.closed}
        </LobbyNotice>
      );
      // Hosts can still look up who was banned and what was done.
      if (!isMemberView(lobby) || lobby.viewer.role !== 'host') return notice;
      return (
        <>
          {notice}
          <div className="mx-auto w-full max-w-xl px-4 pb-8">
            <LobbyHostLists lobby={lobby} />
          </div>
        </>
      );
    }
    case 'not_yet_open':
      return <NotYetOpen lobby={lobby} guest={guest} />;
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
      return <AdmittedLobby lobby={lobby} presence={presence} guest={guest} guestSession={guestSession} />;
  }
}

function NotYetOpen({ lobby, guest }: { lobby: LobbyPageView; guest: boolean }) {
  const reminder = useDebateLobbyReminder();
  const end = useEndDebateLobby(lobby.lobby_id);
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const reminded = lobby.viewer.reminded;
  // Nobody is connected before it opens, so `viewer.hosting` is false; a stored host may still cancel.
  const canCancel = lobby.viewer.role === 'host';

  return (
    <LobbyShell>
      <LobbyTitle lobby={lobby} />
      <Text as="p" variant="metadata" color="text">
        {notYetOpenLabel(lobby)}
      </Text>
      <Text as="p" variant="footnote" color="grey-04">
        {remindedLabel(lobby.reminder_count)}
      </Text>
      {guest ? <LobbyGuestBanner lobbyId={lobby.lobby_id} /> : null}
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
        <Link href={NavUtils.toExplore()} className={hubPillClassName('secondary')}>
          {LOBBY_COPY.findDebate}
        </Link>
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
    </LobbyShell>
  );
}

function AdmittedLobby({
  lobby,
  presence,
  guest,
  guestSession,
}: {
  lobby: LobbyPageView;
  presence: ReturnType<typeof useLobbyPresence>;
  guest: boolean;
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
    return <LobbyNotice action={findDebateAction}>{LOBBY_COPY[state.reason]}</LobbyNotice>;
  }

  if (state.status === 'confirm_leave_other') {
    return (
      <LobbyShell>
        <LobbyTitle lobby={lobby} />
        <Text as="p" variant="metadata">
          {LOBBY_COPY.otherLobby}
        </Text>
        <div className="flex flex-wrap gap-2">
          <HubPillButton
            variant="primary"
            analyticsLabel="Lobby join leaving other"
            onClick={() => void join(true, state.rejoin ?? false)}
          >
            Join this lobby
          </HubPillButton>
          {state.otherLobbyId ? (
            <Link
              href={debateRoomPath(state.otherLobbyId)}
              onClick={() => state.otherLobbyId && markLobbyEntry(state.otherLobbyId, 'other_lobby')}
              className={hubPillClassName('secondary')}
            >
              Back to my lobby
            </Link>
          ) : null}
        </div>
      </LobbyShell>
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
          <Link href={NavUtils.toExplore()} className={hubPillClassName('secondary')}>
            {LOBBY_COPY.findDebate}
          </Link>
        </div>
      </LobbyShell>
    );
  }

  return (
    <LobbyQueuedRequestProvider lobby={lobby} guest={guest} joined={state.status === 'joined'}>
      <LobbyRoom
        lobby={lobby}
        state={state}
        onRetry={() => void join(false)}
        onLeave={() => void (state.status === 'stepped_out' ? leaveSteppedOut() : leave())}
        voice={{ connectionId, setVoiceConnected, awayAt: voiceAwayAt ?? lobby.viewer.voice_away_at }}
        guest={guest}
        guestSession={guestSession}
      />
    </LobbyQueuedRequestProvider>
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
  guest,
  guestSession,
}: {
  lobby: LobbyPageView;
  state: LobbyPresenceState;
  onRetry: () => void;
  onLeave: () => void;
  voice: { connectionId: string; setVoiceConnected: (connected: boolean) => void; awayAt: string | null };
  guest: boolean;
  guestSession: LobbyGuestSession;
}) {
  const currentUserId = useCurrentGeoChatUserId();
  const { authenticated } = useGeoChatAuth();
  // The viewer's own toggle, as the availability pill and People tab read it, ahead of the roster's.
  const ownAvailable = useDebateActivity(authenticated).data?.available_to_debate;
  const end = useEndDebateLobby(lobby.lobby_id);
  const [confirmingEnd, setConfirmingEnd] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const handoff = useHandoffNotice(lobby);
  // Member-only parts read this; a guest's view never reaches them.
  const memberLobby = isMemberView(lobby) ? lobby : null;
  const moderationNotice = useModerationNotice(memberLobby?.viewer ?? NO_MODERATION);
  const queuedRequest = useLobbyQueuedRequest();
  // The guest room, a sibling of the member room so the handover can drop it mid-call.
  const [guestVoiceStates, setGuestVoiceStates] = React.useState<LobbyVoiceStates>(NO_LOBBY_VOICE);
  const guestVoice =
    guestSession.state.status === 'listening' || guestSession.state.status === 'handingOver'
      ? guestSession.state.session.voice
      : null;
  const { authenticated } = useGeoChatAuth();

  const hosts = lobby.members.filter(isHosting);
  const isHost = lobby.viewer.hosting;
  const roster = rosterOrder(lobby.members);
  const speakers = roster.filter(publishes);
  const listeners = roster.filter(member => !publishes(member));
  // Only while in the lobby: stepping out or leaving unmounts it, which disconnects.
  const inVoice = state.status === 'joined' || state.status === 'joining';

  const isViewer = (member: DebateLobbyMember) => currentUserId !== null && sameId(member.user_id, currentUserId);
  const people =
    roster.length === 0 ? (
      <Text as="p" variant="metadata" color="grey-04">
        Nobody’s here right now.
      </Text>
    ) : (
      <>
        <LobbyDebatePairs pairs={lobby.debate_pairs ?? []} members={lobby.members} />
        <RosterSection
          label="Speakers"
          lobby={lobby}
          members={speakers}
          isViewer={isViewer}
          ownAvailable={ownAvailable}
        />
        <RosterSection
          label="Listeners"
          lobby={lobby}
          members={listeners}
          isViewer={isViewer}
          ownAvailable={ownAvailable}
        />
        <LobbyGuestCount count={lobby.guest_count ?? 0} includesViewer={guest && guestVoice !== null} />
      </>
    );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(lobbyShareUrl(lobby.lobby_id));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <LobbyShell>
      <div className="flex flex-col gap-2">
        <LobbyTitle lobby={lobby} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green/10 px-2 py-0.5">
            <span aria-hidden className="size-2 rounded-full bg-green" />
            <Text as="span" variant="footnoteMedium" color="text">
              Live · {hereLabel(lobby.members.length)} · {debatingLabel(debatingCount(lobby.members))}
            </Text>
          </span>
          {/* The visitor count for people without an account goes here. */}
          <Text as="span" variant="footnote" color="grey-04">
            {[hosts.length ? `Hosted by ${hostsLabel(hosts)}` : 'No host here', 'Not recorded'].join(' · ')}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <HubPillButton analyticsLabel="Lobby copy link" onClick={() => void copyLink()}>
            {copied ? 'Link copied' : 'Copy link'}
          </HubPillButton>
          {guest ? (
            <Link href={NavUtils.toExplore()} className={hubPillClassName('secondary')}>
              Leave lobby
            </Link>
          ) : (
            <HubPillButton analyticsLabel="Lobby leave" onClick={onLeave}>
              Leave lobby
            </HubPillButton>
          )}
          <HubHeaderControls analyticsSurface="lobby" />
          {isHost ? (
            confirmingEnd ? (
              <>
                <HubPillButton
                  variant="primary"
                  analyticsLabel="Lobby end confirm"
                  pending={end.isPending}
                  pendingLabel="Ending…"
                  onClick={() => end.mutate()}
                >
                  End for everyone
                </HubPillButton>
                <HubPillButton analyticsLabel="Lobby end cancel" onClick={() => setConfirmingEnd(false)}>
                  Cancel
                </HubPillButton>
              </>
            ) : (
              <HubPillButton analyticsLabel="Lobby end" onClick={() => setConfirmingEnd(true)}>
                End lobby
              </HubPillButton>
            )
          ) : null}
        </div>
        {end.isError ? (
          <Text as="p" variant="footnote" color="red-01">
            {lobbyErrorMessage(end.error, 'Could not end the lobby. Try again.')}
          </Text>
        ) : null}
      </div>

      {handoff ? (
        <div role="status" className="rounded-md bg-grey-01 px-3 py-2">
          <Text as="p" variant="footnote" color="text">
            {personName(handoff)} is hosting now
          </Text>
        </div>
      ) : null}

      {queuedRequest.outcome ? (
        <div role="status" className="flex items-center gap-2 rounded-md bg-grey-01 px-3 py-2">
          <Text as="p" variant="footnote" color="text" className="min-w-0 flex-1">
            {queuedRequest.outcome}
          </Text>
          <HubPillButton analyticsLabel="Lobby queued request dismiss" onClick={queuedRequest.dismissOutcome}>
            OK
          </HubPillButton>
        </div>
      ) : null}

      {guest ? <LobbyGuestBanner lobbyId={lobby.lobby_id} /> : null}

      {moderationNotice ? (
        <div role="status" className="rounded-md bg-grey-01 px-3 py-2">
          <Text as="p" variant="footnote" color="text">
            {moderationNotice}
          </Text>
        </div>
      ) : null}

      {memberLobby &&
      state.status === 'joined' &&
      memberLobby.viewer.role === 'listener' &&
      !memberLobby.viewer.hosting ? (
        <LobbyHandControl lobby={memberLobby} />
      ) : null}

      {state.status === 'stepped_out' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text as="p" variant="footnote" color="text">
            {LOBBY_COPY.steppedOut}
          </Text>
          <HubPillButton variant="primary" analyticsLabel="Lobby back to the room" onClick={onRetry}>
            Back to the room
          </HubPillButton>
        </div>
      ) : state.status === 'failed' ? (
        <div className="flex items-center gap-2">
          <Text as="p" variant="footnote" color="red-01">
            {state.message}
          </Text>
          <HubPillButton analyticsLabel="Lobby retry join" onClick={onRetry}>
            Try again
          </HubPillButton>
        </div>
      ) : state.status === 'joining' ? (
        <Text as="p" variant="footnote" color="grey-04">
          Joining…
        </Text>
      ) : null}

      {guest && guestSession.state.status === 'refused' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-grey-02 bg-white px-3 py-2">
          <div role="status" className="min-w-0 flex-1">
            <Text as="p" variant="footnote" color="grey-04">
              {guestSession.state.message}
            </Text>
          </div>
          {authenticated ? null : (
            <HubPillButton analyticsLabel="Lobby guest retry listen" onClick={guestSession.retry}>
              Try again
            </HubPillButton>
          )}
        </div>
      ) : guest && guestSession.state.status === 'starting' ? (
        <Text as="p" variant="footnote" color="grey-04">
          Connecting voice…
        </Text>
      ) : null}

      <LobbyVoiceStatesProvider value={guestVoiceStates}>
        {guestVoice ? (
          <LobbyGuestVoice
            key={guestVoice.token}
            token={guestVoice}
            onStates={setGuestVoiceStates}
            onReconnect={guestSession.reconnect}
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

      {state.status === 'joined' || guest ? <LobbyClaimsArea lobby={lobby} /> : null}

      {memberLobby?.viewer.hosting ? <LobbyHostLists lobby={memberLobby} /> : null}
    </LobbyShell>
  );
}

/** Hosts, the acting host and speakers; they are the ones voice lets publish. */
function publishes(member: DebateLobbyMember) {
  return isHosting(member) || member.role === 'speaker';
}

function RosterSection({
  label,
  lobby,
  members,
  isViewer,
  ownAvailable,
}: {
  label: string;
  lobby: LobbyPageView;
  members: DebateLobbyMember[];
  isViewer: (member: DebateLobbyMember) => boolean;
  ownAvailable: boolean | undefined;
}) {
  if (members.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <Text as="h2" variant="footnoteMedium" color="grey-04">
        {label} · {members.length}
      </Text>
      <ul className="flex flex-col divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white">
        {members.map(member => (
          <RosterRow
            key={member.user_id}
            lobby={lobby}
            member={member}
            isViewer={isViewer(member)}
            ownAvailable={ownAvailable}
          />
        ))}
      </ul>
    </section>
  );
}

function RosterRow({
  lobby,
  member,
  isViewer,
  ownAvailable,
}: {
  lobby: LobbyPageView;
  member: DebateLobbyMember;
  isViewer: boolean;
  ownAvailable: boolean | undefined;
}) {
  const status = memberStatus(member, isViewer ? ownAvailable : undefined);
  const statusLine = member.in_debate ? (
    <LobbyDebateSubject subject={member.in_debate_subject} />
  ) : member.stepped_out ? (
    'Stepped out'
  ) : status ? (
    STATUS_LABEL[status]
  ) : null;
  const voice = useLobbyVoiceStates();
  const voiceId = dashlessId(member.user_id).toLowerCase();
  const speaking = voice.speaking.has(voiceId);
  // Mic state only means something for someone who can publish, in a room this tab is connected to.
  const showMic = voice.connected && publishes(member) && !member.stepped_out;
  const micOn = voice.micOn.has(voiceId);

  return (
    <li className="flex items-center gap-3 px-3 py-2" data-testid="lobby-roster-row">
      <span
        className={cx('h-8 w-8 shrink-0 overflow-hidden rounded-full', speaking && 'ring-2 ring-successTertiary')}
        data-speaking={speaking || undefined}
      >
        <Avatar avatarUrl={member.avatar_cid} value={member.profile_space_id} alt={personName(member)} size={32} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <LobbyPersonName person={member} interactionSurface="lobby_roster">
            <Text as="span" variant="metadataMedium" className="truncate">
              {personName(member)}
              {isViewer ? ' (you)' : ''}
            </Text>
          </LobbyPersonName>
          {member.newcomer ? (
            <span className="shrink-0 rounded bg-ctaTertiary px-1 text-footnoteMedium text-ctaPrimary">New</span>
          ) : null}
        </div>
        {statusLine ? (
          <Text as="p" variant="footnote" color="grey-04" ellipsize>
            {statusLine}
          </Text>
        ) : null}
      </div>
      {showMic ? (
        <span className={micOn ? 'text-green' : 'text-grey-04'} aria-label={micOn ? 'Mic on' : 'Muted'} role="img">
          <MicrophoneIcon muted={!micOn} />
        </span>
      ) : null}
      <LobbyRequestDebate lobbyId={lobby.lobby_id} member={member} />
      <span
        className={cx(
          'rounded-full px-2 py-0.5 text-footnoteMedium',
          isHosting(member) ? 'bg-text text-white' : 'bg-grey-01 text-grey-04'
        )}
      >
        {member.acting_host ? 'Hosting' : ROLE_LABEL[member.role]}
      </span>
      <LobbyMemberMenu lobby={lobby} member={member} isSelf={isViewer} micOn={showMic ? micOn : undefined} />
    </li>
  );
}

/** "X is hosting now" for a few seconds after hosting changes hands. */
export function useHandoffNotice(lobby: Pick<LobbyPageView, 'hosts_changed_at' | 'members'>) {
  const seenRef = React.useRef<string | null | undefined>(undefined);
  const [notice, setNotice] = React.useState<DebateLobbyMember | null>(null);

  React.useEffect(() => {
    const next = hostAfterChange(seenRef.current, lobby);
    seenRef.current = lobby.hosts_changed_at;
    if (next) setNotice(next);
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
}: {
  children: React.ReactNode;
  busy?: boolean;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex min-h-[calc(100dvh-2.75rem)] items-center justify-center px-5 py-8" role="status">
      <div className="flex items-center gap-3 rounded-lg border border-grey-02 bg-white px-5 py-4 shadow-light">
        {busy && <Spinner />}
        <Text color="grey-04">{children}</Text>
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
    <div role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-grey-01 px-3 py-2">
      <Text as="p" variant="footnote" color="text">
        {now >= at ? 'You show as away to others.' : 'You’ll show as away soon unless you’re still here.'}
      </Text>
      <HubPillButton analyticsLabel="Lobby voice still here" onClick={() => setAckedAt(at)}>
        I’m still here
      </HubPillButton>
    </div>
  );
}
