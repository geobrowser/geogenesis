'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import Link from 'next/link';

import { useIsPhoneLayout } from '~/core/hooks/use-is-phone-layout';

import { Text } from '~/design-system/text';

import type { DebateLobbyMember } from '../api';
import { useGeoChatAuth } from '../hooks';
import { hubAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { HubPillButton, hubPillClassName } from '../matchmaking/hub-pill-button';
import { HUB_SCROLL_SELECTOR, HubScrollSelectorProvider } from '../matchmaking/hub-scroll';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useScrollLock } from '../use-scroll-lock';
import { type LobbyPresenceState, MAX_TIMEOUT_MS } from './hooks';
import { LobbyControlBar, LobbyHandControl } from './lobby-control-bar';
import { hostAfterChange, hostWhoLeft, isAlone, isHosting } from './lobby-format';
import { LobbyGuestBanner } from './lobby-guest';
import { useDebateLobbyGuestView, useIsLobbyGuest, type useLobbyGuestSession } from './lobby-guest-hooks';
import { useModerationNotice } from './lobby-moderation';
import { type LobbyGuestNotice, type LobbyHandoffNotice, LobbyNotices, LobbyToast } from './lobby-notices';
import { useIsCallRoom } from './lobby-purpose';
import { LobbyShowPeopleContext, LobbySlot, LobbySlotsProvider, useLobbySlotTargets } from './lobby-slots';
import { LobbyEmptyRoom } from './lobby-state-cards';
import { type LobbyPageView, isMemberView } from './lobby-view';
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

export const LOBBY_ROOM_COPY = {
  guestElsewhere: 'You’re listening in another tab.',
  guestPaused: 'You’re not listening in this tab.',
  guestListeningOff: 'Listening without an account has been turned off for this lobby. Create an account to join.',
  callGuestListeningOff: 'Listening without an account has been turned off for this call. Create an account to join.',
} as const;

type LobbyGuestSession = ReturnType<typeof useLobbyGuestSession>;

export type LobbyPhoneTab = 'people' | 'aside';

/**
 * The second column beside the people (the lobby's claims): on a desktop a scrolling column, on a
 * phone a tab. A room without one is the people alone.
 */
export type LobbyRoomAside = {
  /** The phone tab's name. */
  tab: string;
  /** The desktop column's accessible name. */
  label: string;
  /** A dot on the phone tab for something not seen yet. */
  mark: boolean;
  content: React.ReactNode;
};

/**
 * The room both a lobby and a space call are drawn in (GEO-3131, GEO-3419): the header, the people
 * with voice, an optional second column, and the bottom bar. What each puts in it comes in as props.
 */
export function LobbyRoomShell({
  lobby,
  state,
  onRetry,
  onLeave,
  voice,
  guestSession,
  exitHref,
  header,
  before,
  belowHeader,
  people,
  aside,
  tab,
  onTab,
  availability,
  queuedOutcome,
  onDismissQueuedOutcome,
  voiceExtras,
}: {
  lobby: LobbyPageView;
  state: LobbyPresenceState;
  onRetry: () => void;
  onLeave: () => void;
  voice: { connectionId: string; setVoiceConnected: (connected: boolean) => void; awayAt: string | null };
  guestSession: LobbyGuestSession;
  exitHref: string;
  header: React.ReactNode;
  /** Above the header. */
  before?: React.ReactNode;
  /** Under the header, above the phone tabs. */
  belowHeader?: React.ReactNode;
  /** The roster; drawn inside the voice room so it reads who is speaking. */
  people: React.ReactNode;
  /** Shown once the viewer is in, or listening as a guest. */
  aside?: LobbyRoomAside;
  tab: LobbyPhoneTab;
  onTab: (tab: LobbyPhoneTab) => void;
  /** The availability pill for a phone's bottom bar. */
  availability?: React.ReactNode;
  queuedOutcome?: string | null;
  onDismissQueuedOutcome?: () => void;
  /** Passed to the member voice room: what a call adds to it. */
  voiceExtras?: Pick<React.ComponentProps<typeof LobbyVoice>, 'screenShare' | 'preJoin'>;
}) {
  const guest = useIsLobbyGuest();
  const call = useIsCallRoom();
  const currentUserId = useCurrentGeoChatUserId();
  const { authenticated } = useGeoChatAuth();
  const phone = useIsPhoneLayout();
  const handoff = useHandoffNotice(lobby);
  // Member-only parts read this; a guest's view never reaches them.
  const memberLobby = isMemberView(lobby) ? lobby : null;
  const moderationNotice = useModerationNotice(memberLobby?.viewer ?? NO_MODERATION);
  const slots = useLobbySlotTargets();
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
        ? {
            message: guestSession.otherTabListening ? LOBBY_ROOM_COPY.guestElsewhere : LOBBY_ROOM_COPY.guestPaused,
            retry: 'Listen here',
          }
        : guestEnded && guestEndedAt !== null && guestViewAt >= guestEndedAt
          ? {
              message: call ? LOBBY_ROOM_COPY.callGuestListeningOff : LOBBY_ROOM_COPY.guestListeningOff,
              retry: null,
            }
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
  const inside = state.status === 'joined' || guest;
  const showAside = aside !== undefined && inside;
  const tabbed = phone && showAside;
  const tabIds = useTabIds();
  // From the speaker strip on the aside (GEO-3399). The strip's button is about to be hidden with
  // the aside, so focus goes to the People tab rather than being dropped on the page.
  const peopleTabId = tabIds.people.tab;
  const showPeople = React.useCallback(() => {
    onTab('people');
    document.getElementById(peopleTabId)?.focus();
  }, [onTab, peopleTabId]);
  const onPeopleTab = !phone || !showAside || tab === 'people';
  const onAsideTab = !phone || tab === 'aside';
  const alone = inside && isAlone(lobby, guest ? null : currentUserId, guest, guestVoice !== null);

  // The empty-room block stands in for an empty roster's own line.
  const roster =
    alone && lobby.members.length === 0 ? null : (
      // A phone's speaker strip on the aside (GEO-3399) taps back to People.
      <LobbyShowPeopleContext.Provider value={tabbed ? showPeople : null}>{people}</LobbyShowPeopleContext.Provider>
    );
  const handControl =
    memberLobby &&
    state.status === 'joined' &&
    memberLobby.viewer.role === 'listener' &&
    !memberLobby.viewer.hosting ? (
      <LobbyHandControl lobby={memberLobby} />
    ) : null;
  const leaveLabel = call ? 'Leave call' : 'Leave lobby';
  const leave = guest ? (
    <Link href={exitHref} replace aria-label={leaveLabel} className={hubPillClassName('secondary', 'md:h-10')}>
      <LeaveLabel full={leaveLabel} />
    </Link>
  ) : (
    <HubPillButton
      analyticsLabel={call ? 'Call leave' : 'Lobby leave'}
      aria-label={leaveLabel}
      onClick={onLeave}
      className="md:h-10"
    >
      <LeaveLabel full={leaveLabel} />
    </HubPillButton>
  );

  // On a desktop the people and the aside sit side by side, so each column scrolls on its own
  // under a fixed header and bar; scrolling the page would carry the speakers off with the claims.
  // A phone shows one tab at a time and keeps scrolling the page.
  const columns = showAside && !phone;
  const columnScroll = columns && 'overflow-y-auto overscroll-contain';
  // The columns fill the viewport and scroll themselves; the page around them must not, or a scroll
  // outside them moves it onto blank space.
  useScrollLock(columns);

  return (
    <LobbySlotsProvider value={slots.targets}>
      <div
        className={cx('flex flex-col', columns ? 'h-[calc(100dvh-2.75rem)]' : 'min-h-[calc(100dvh-2.75rem)]')}
        data-testid="debate-lobby"
      >
        {before}
        {header}
        {belowHeader}
        {tabbed ? (
          <LobbyPhoneTabs
            ids={tabIds}
            tab={tab}
            onTab={onTab}
            asideLabel={aside.tab}
            asideMark={aside.mark}
            label={call ? 'Call' : 'Lobby'}
          />
        ) : null}

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
              : { 'aria-label': call ? 'People in the call' : 'People in the lobby' })}
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
                  screenShare={voiceExtras?.screenShare}
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
                  {...voiceExtras}
                >
                  <VoiceAwayWarning awayAt={voice.awayAt} />
                  {roster}
                </LobbyVoice>
              ) : (
                roster
              )}
            </LobbyVoiceStatesProvider>
          </section>

          {showAside ? (
            <motion.aside
              // Framer measures its layout animations (the tab underline, Explore's list) through it.
              layoutScroll
              {...(tabbed
                ? { role: 'tabpanel', id: tabIds.aside.panel, 'aria-labelledby': tabIds.aside.tab }
                : { 'aria-label': aside.label })}
              hidden={!onAsideTab}
              // Its lists page and read cards against this box, only while it scrolls: a box that does
              // not would hold every row in range at once. The provider rebuilds their observers when
              // the breakpoint flips it, as the claims stay mounted across that.
              data-debates-hub-scroll={columns ? '' : undefined}
              className={cx(
                'flex min-w-0 flex-col gap-3 border-l border-grey-02 px-4 py-5 md:border-l-0 md:py-3',
                columnScroll
              )}
            >
              {/* The roster's speaker thumbnails (GEO-3399), drawn here so they stay in view on the aside. */}
              {tabbed ? <div ref={slots.speakerStripRef} className="empty:hidden" /> : null}
              <HubScrollSelectorProvider value={columns ? HUB_SCROLL_SELECTOR : undefined}>
                {aside.content}
              </HubScrollSelectorProvider>
            </motion.aside>
          ) : null}
        </div>

        <LobbyControlBar
          controlsRef={slots.controlsRef}
          hand={handControl}
          availability={phone ? availability : null}
          showHint={!guest && !call}
          leave={leave}
          banner={guest ? <LobbyGuestBanner lobbyId={lobby.lobby_id} listening={guestVoiceStates.connected} /> : null}
          notices={
            <LobbyNotices
              noticesRef={slots.noticesRef}
              handoff={handoff}
              queuedOutcome={queuedOutcome ?? null}
              onDismissQueuedOutcome={onDismissQueuedOutcome ?? noop}
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

function noop() {}

function LeaveLabel({ full }: { full: string }) {
  return (
    <>
      <span className="md:hidden">{full}</span>
      <span className="hidden md:inline">Leave</span>
    </>
  );
}

type TabIds = Record<LobbyPhoneTab, { tab: string; panel: string }>;

function useTabIds(): TabIds {
  const base = React.useId();
  return {
    people: { tab: `${base}-people-tab`, panel: `${base}-people-panel` },
    aside: { tab: `${base}-claims-tab`, panel: `${base}-claims-panel` },
  };
}

const PHONE_TAB_ORDER: LobbyPhoneTab[] = ['people', 'aside'];

/**
 * Phone: People and the aside (Claims in a lobby), with a dot for something there not seen yet.
 * Arrow keys, Home and End move between tabs; only the selected one is in the tab order.
 */
function LobbyPhoneTabs({
  ids,
  tab,
  onTab,
  asideLabel,
  asideMark,
  label,
}: {
  ids: TabIds;
  tab: LobbyPhoneTab;
  onTab: (tab: LobbyPhoneTab) => void;
  asideLabel: string;
  asideMark: boolean;
  label: string;
}) {
  const labels: Record<LobbyPhoneTab, string> = { people: 'People', aside: asideLabel };
  const select = (index: number) => {
    const next = PHONE_TAB_ORDER[(index + PHONE_TAB_ORDER.length) % PHONE_TAB_ORDER.length]!;
    onTab(next);
    document.getElementById(ids[next].tab)?.focus();
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const current = PHONE_TAB_ORDER.indexOf(tab);
    const target =
      event.key === 'ArrowRight'
        ? current + 1
        : event.key === 'ArrowLeft'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? PHONE_TAB_ORDER.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    select(target);
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="mx-4 mt-2 flex border-b border-grey-02">
      {PHONE_TAB_ORDER.map(id => (
        <button
          key={id}
          id={ids[id].tab}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={ids[id].panel}
          tabIndex={tab === id ? 0 : -1}
          {...hubAnalyticsAttributes(`Lobby ${labels[id]} tab`, 'navigate_lobby_claims')}
          onClick={() => onTab(id)}
          className={cx(
            'inline-flex flex-1 items-center justify-center gap-1.5 pb-2 text-[17px] leading-[22px] font-semibold',
            tab === id ? 'text-text shadow-[inset_0_-1px_0_var(--color-text)]' : 'text-grey-04'
          )}
        >
          {labels[id]}
          {id === 'aside' && asideMark ? (
            <span className="size-1.5 rounded-full bg-ctaPrimary" aria-label="New" role="img" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** A failed join, or joining: above the people, where the room would be. */
function LobbyRoomStatus({ state, onRetry }: { state: LobbyPresenceState; onRetry: () => void }) {
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

/** How long before `voice_away_at` the warning shows. */
const VOICE_AWAY_WARNING_MS = 2 * 60_000;

/**
 * Voice keeps a quiet listener available only with recent input; any click counts as input, so
 * the button needs no handler of its own.
 */
function VoiceAwayWarning({ awayAt }: { awayAt: string | null }) {
  const { connected } = useLobbyVoiceStates();
  const call = useIsCallRoom();
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

  // Away only affects debate requests, which a call has none of.
  if (call) return null;
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
