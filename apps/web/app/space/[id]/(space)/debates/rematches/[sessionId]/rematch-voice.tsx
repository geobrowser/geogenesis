'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useIsMuted,
  useIsSpeaking,
  useLocalParticipant,
  useMediaDeviceSelect,
  useRemoteParticipants,
  useRoomContext,
} from '@livekit/components-react';
import * as Popover from '@radix-ui/react-popover';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { ConnectionState, MediaDeviceFailure, type Room, Track } from 'livekit-client';
import type { RemoteParticipant } from 'livekit-client';

import { capture } from '~/core/analytics';
import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import type { DebateRematchParticipant, DebateRematchSession } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';
import { AudioSettings, MobileSettingsSheet } from '~/core/debates/audio-settings';
import { useOpenDebaterProfile } from '~/core/debates/browse/use-open-debater-profile';
import { MicrophoneIcon } from '~/core/debates/debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '~/core/debates/debate-room-ownership';
import { debateQueryKeys, useGeoChatAuth, useRematchLiveKitJoin } from '~/core/debates/hooks';
import { type MediaDeviceOption, systemDefaultAudioOutput, useDebateMediaSession } from '~/core/debates/media-session';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import {
  PAIR_PILL,
  type PairHeaderParticipant,
  type PairHeaderToast,
  type PairHeaderVoice,
  type PairMicState,
  RematchPairHeader,
} from './rematch-pair-header';

// A pair arriving from a recorded debate was already speaking with the microphone open, so the
// debate-again room preserves that live conversation. A profile challenge has no preceding call or
// user gesture that opened the microphone; it continues to join listen-only until the user unmutes.
function microphoneEnabledByDefault(session: DebateRematchSession) {
  return session.source_debate_id !== null;
}

/**
 * How long a nudge stays up before it stops being information and starts being noise.
 *
 * Longer than the dock's 4s bubble was. That bubble said one word and asked for nothing; these
 * toasts carry a button the viewer has to read, reach and press, and four seconds is not enough
 * time to do that from the middle of a sentence.
 */
const NUDGE_MS = 10_000;

type OwnershipState = 'pending' | 'owned' | 'elsewhere';

function voiceCapable(status: DebateRematchSession['status']) {
  return status === 'browsing' || status === 'request_pending';
}

/** `permissions.query` is unevenly implemented — Firefox has no `microphone` descriptor at all. */
async function microphonePermissionState(): Promise<PermissionState | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for the microphone once, up front, and hand it straight back.
 *
 * A muted challenge means nothing would otherwise call `getUserMedia` until the user clicks unmute —
 * and a permission dialog that lands the moment someone starts talking is its own kind of
 * intrusive. Priming it here moves the prompt to a point where the user is not mid-sentence, and
 * leaves the unmute click instant. It also gives the settings panel real device labels, which
 * `enumerateDevices` withholds until the origin has been granted the microphone once.
 *
 * The stream is stopped as soon as it arrives, and stopped even if this unmounts first: holding it
 * would keep the device seized and the browser's recording indicator lit next to a header that says
 * muted, which is the whole thing this flow is trying not to do.
 *
 * A denial needs nothing here. The header is listen-only either way, and the unmute button reports
 * it through LiveKit's `onMediaDeviceFailure` like any other microphone failure.
 */
function usePrimedMicrophonePermission(enabled: boolean, deviceId?: string) {
  // Once per visit, whatever `enabled` does afterwards. A dismissed prompt — closed rather than
  // answered — leaves the permission on 'prompt', so without this every later false→true flip
  // asks again: a takeover handed back, a token retry, or simply muting again after an unmute.
  // Re-asking someone who has already waved the dialog away is the unsolicited prompt this whole
  // flow is trying to remove.
  const attemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!enabled || attemptedRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    attemptedRef.current = true;
    let cancelled = false;

    void (async () => {
      // Only when the browser positively says a prompt is pending. 'granted' is the usual case,
      // since the pair generally arrives straight from a debate, and opening the device there
      // would buy nothing. 'denied' cannot be talked round. And a browser that cannot answer at
      // all — Firefox — must not be primed blind: that would open the microphone on every mount
      // for every user, which is exactly the seizure joining muted set out to remove. There the
      // prompt stays on the unmute click, where it was before any of this.
      const state = await microphonePermissionState();
      if (cancelled || state !== 'prompt') return;
      try {
        // The device the pair settled on in the preceding debate, not the system default. A bare
        // `{audio: true}` opens whatever the OS considers default, which can flip a Bluetooth
        // headset into HFP for a moment and can fail outright when the default is busy in
        // another call while the chosen microphone is free — the exact situation the muted join
        // is trying to stay out of.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId } : true });
        // Unconditionally, `cancelled` or not — an abandoned stream holds the microphone open.
        stream.getTracks().forEach(track => track.stop());
      } catch {
        // Denied, or no microphone. Both are the unmute button's problem, not this effect's.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, deviceId]);
}

/**
 * "{Name} is talking", once.
 *
 * A profile-challenge pair lands here muted by a default they did not choose, so the first time the
 * other person actually says something is both when that default is most likely to surprise them
 * and when a silent reply starts reading as being ignored. Firing on the opponent's voice rather
 * than on the user's own keeps the microphone closed: a muted track publishes silence, so detecting
 * that the user is talking would mean holding a second live stream open for the whole session.
 *
 * Once per visit, and only while muted — a nudge that returns on every turn is just a mute button
 * that shouts. `spentRef` is owned by the header's outermost component rather than declared here on
 * purpose: this hook's component is unmounted and rebuilt by every reconnect and every "audio is
 * blocked" detour, so a local ref would quietly reset the one-shot several times a session.
 */
function useMutedNudge(muted: boolean, opponentAudible: boolean, spentRef: React.MutableRefObject<boolean>) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (spentRef.current || !muted || !opponentAudible) return;
    spentRef.current = true;
    setVisible(true);
  }, [muted, opponentAudible, spentRef]);

  // The dismissal clock is deliberately its own effect, keyed only on `visible`. Sharing the
  // effect above would put `opponentAudible` in its dependencies, and the opponent stops talking
  // within a second or two: the cleanup would clear the pending timeout, the one-shot gate would
  // early-return instead of re-arming it, and the toast would sit there for the rest of the
  // session.
  React.useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), NUDGE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  // Unmuting is what the nudge was asking for; leaving it up afterwards is just noise.
  React.useEffect(() => {
    if (!muted) setVisible(false);
  }, [muted]);

  // For the mute button, which cannot wait for `muted` to catch up: unmuting leaves
  // `isMicrophoneEnabled` false for as long as the permission dialog is open, so the effect above
  // would keep the toast on screen for seconds after the click that answered it. Spending the ref
  // alone is not enough — that stops the next nudge, not the one already rendered.
  const dismiss = React.useCallback(() => {
    spentRef.current = true;
    setVisible(false);
  }, [spentRef]);

  return { visible, dismiss };
}

/**
 * Everything the header needs that does not come from the room: who the two people are, how to
 * reach the opponent's space, and which claim (if any) the pair have locked.
 */
type PairContext = {
  local: PairHeaderParticipant | null;
  opponent: PairHeaderParticipant;
  opponentName: string;
  onOpenOpponentSpace: (event: React.MouseEvent) => void;
  leaveAction?: React.ReactNode;
};

function toHeaderParticipant(participant: DebateRematchParticipant | null): PairHeaderParticipant | null {
  if (!participant) return null;
  return {
    displayName: participant.display_name,
    profileSpaceId: participant.profile_space_id,
    avatarCid: participant.avatar_cid,
  };
}

/**
 * The live voice channel for the rematch picker, drawn as the page's pair header (GEO-2992).
 *
 * The pair lands here from "debate again" or a profile challenge, and this keeps them talking while
 * they browse claims. Audio-only; mute is a local track toggle and the opponent's state comes
 * straight from LiveKit participant events.
 *
 * Degrades to the cards alone when the backend has no LiveKit config (503), predates the endpoint
 * (404), or the session has left a voice-capable status — the two people are still in a rematch
 * together, and the header is how the page says so. A denied microphone keeps the room in
 * listen-only mode rather than tearing it down.
 */
type RematchVoiceHeaderProps = {
  session: DebateRematchSession;
  currentUserId: string;
  /** The page's Leave button. It lives in your card's corner now, not at the end of the tab row. */
  leaveAction?: React.ReactNode;
  /**
   * The viewer is on their way out, and the page is about to unmount.
   *
   * Leaving ends the session server-side, and an ended session is not voice-capable — so without
   * this the controls tear themselves down a second or so before the redirect lands, and the card
   * collapses in front of someone who has already left. Nothing about this header is worth
   * re-laying-out on the way to somewhere else.
   */
  exiting?: boolean;
};

export function RematchVoiceHeader(props: RematchVoiceHeaderProps) {
  // Next preserves a dynamic route's client component when only `sessionId` changes. Scope all
  // connection and microphone intent state to the session so a profile challenge cannot inherit
  // an open microphone from a recorded debate (or leave that recorded-debate rematch muted).
  return <SessionRematchVoiceHeader key={props.session.id} {...props} />;
}

function SessionRematchVoiceHeader({ session, currentUserId, leaveAction, exiting = false }: RematchVoiceHeaderProps) {
  const voiceCapableNow = voiceCapable(session.status);
  /**
   * Whether voice has been live at all this visit.
   *
   * `exiting` alone is not enough to hold the room open, because it is also true from the first
   * render of a rematch that was already over when the link was opened — and "keep what is there"
   * would become "start a room, take the tab lock and publish a microphone" into a session the
   * viewer is not in, on a page that is busy redirecting. A debate-sourced rematch joins unmuted,
   * so that is a live microphone rather than a wasted request.
   */
  const [voiceWasActive, setVoiceWasActive] = React.useState(false);
  React.useEffect(() => {
    if (voiceCapableNow) setVoiceWasActive(true);
  }, [voiceCapableNow]);

  // Sticky on the way out, but only over a room that was already up: the connection and its
  // controls last until the page unmounts, which is what stops the card resizing between the click
  // and the redirect.
  const voiceActive = voiceCapableNow || (exiting && voiceWasActive);
  const opponent = session.participants.find(participant => participant.user_id !== currentUserId) ?? null;
  const local = session.participants.find(participant => participant.user_id === currentUserId) ?? null;

  // Only one tab per user may hold the mic. Same coordinator as the debate room, namespaced so a
  // rematch session can never collide with a debate id.
  const [ownership, setOwnership] = React.useState<OwnershipState>('pending');
  const roomRef = React.useRef<Room | null>(null);
  const coordinatorRef = React.useRef<ReturnType<typeof createDebateRoomOwnershipCoordinator> | null>(null);

  React.useEffect(() => {
    if (!voiceActive) {
      // Ownership outlives the coordinator that granted it otherwise, so a session that leaves a
      // voice-capable status and comes back would let this tab connect on a cached token before the
      // new lock is acquired.
      setOwnership('pending');
      return;
    }
    let cancelled = false;
    const coordinator = createDebateRoomOwnershipCoordinator({
      debateId: `rematch:${session.id}`,
      userId: currentUserId,
      onTakeoverRequested: async () => {
        // Yield only when the user isn't looking at this tab — and finish disconnecting before
        // answering, so the winning tab never publishes alongside this one.
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
        try {
          await roomRef.current?.disconnect();
        } catch {
          // A failed disconnect still releases the mic when the page goes away; yield regardless.
        }
        roomRef.current = null;
        if (!cancelled) setOwnership('elsewhere');
        return true;
      },
    });
    coordinatorRef.current = coordinator;

    void (async () => {
      const result = await coordinator.acquire();
      if (cancelled) return;
      if (result.acquired) {
        setOwnership('owned');
        return;
      }
      // Another tab owns the voice connection. A visible tab is the one the user is actually in,
      // so it asks once; a background tab waits for the user to press "Use voice here".
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const released = await coordinator.requestTakeover();
        if (cancelled) return;
        setOwnership(released ? 'owned' : 'elsewhere');
      } else {
        setOwnership('elsewhere');
      }
    })();

    return () => {
      cancelled = true;
      coordinatorRef.current = null;
      void coordinator.release();
      coordinator.close();
    };
  }, [currentUserId, session.id, voiceActive]);

  const join = useRematchLiveKitJoin(session.id, voiceActive && ownership === 'owned');

  const [micFailure, setMicFailure] = React.useState<MediaDeviceFailure | null>(null);

  // `<LiveKitRoom audio>` is not a one-time "publish on join" flag. Recovery remounts the room
  // around a fresh token via `connectionEpoch`, and each mount connects anew and replays
  // `setMicrophoneEnabled(!!audio)` from its `SignalConnected` handler — so a hardcoded `true`
  // would put a muted user back on air the moment they hit Retry. The prop has to track what the
  // user wants. (A plain reconnect is not the risk here: that republishes the existing tracks and
  // preserves their mute state, without re-running the handler.)
  const [micIntent, setMicIntent] = React.useState(() => microphoneEnabledByDefault(session));

  // Owned here, where nothing below the page itself can remount them, so each one-shot is spent
  // once per visit rather than once per connection.
  const nudgeSpentRef = React.useRef(false);
  // The unmute notice is state rather than a ref because taking it down has to re-render. Its
  // "once a session" half is the ref the state is seeded from, so a reconnect cannot bring it back.
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);

  // GEO-2992 instrumentation: how many people ever unmute here, and how long it takes them. Both
  // carry `surface`, so the pair header can be read against the corner dock it replaced.
  const analytics = useVoiceAnalytics(session.id, micIntent);

  // Recovery from a dead connection: mint a fresh token and remount the room. Handing a mounted
  // `<LiveKitRoom>` a new token would tear it down mid-flight, so the epoch key remounts instead.
  //
  // `resetQueries`, not `invalidateQueries`: rematch tokens live five minutes, and an invalidated
  // query keeps serving its old data while the refetch is in flight. The epoch bump is synchronous,
  // so the room would remount around the token that just failed — by now almost certainly the
  // expired one. Resetting clears `join.data`, and the header renders its cards with no controls
  // until the new token lands. A retry is also the user's second run at a denied microphone, so the
  // failure latch has to come off with it or the mute button stays disabled until a page reload.
  const [connectionEpoch, setConnectionEpoch] = React.useState(0);
  const [connectFailed, setConnectFailed] = React.useState(false);
  const connectedRef = React.useRef(false);
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  const retry = React.useCallback(() => {
    void queryClient.resetQueries({ queryKey: debateQueryKeys.rematchLiveKit(accountKey, session.id) });
    setMicFailure(null);
    setConnectFailed(false);
    connectedRef.current = false;
    setConnectionEpoch(epoch => epoch + 1);
  }, [accountKey, queryClient, session.id]);

  // A rejected `room.connect()` is otherwise a console warning and nothing else: the connect effect
  // never re-runs on its own, so the header would sit on "Connecting voice…" forever while the
  // Retry affordance stays out of reach behind a connection that never happened. `onError` also
  // fires when publishing the local track fails after signal connect — that one is not fatal, the
  // room is up and `onMediaDeviceFailure` already reports it, hence the connected guard.
  //
  // Both handlers have to be stable: they sit in the dependency arrays of the effects that connect
  // the room and register its listeners, so an inline arrow reconnects on every render.
  const handleConnected = React.useCallback(() => {
    connectedRef.current = true;
    setConnectFailed(false);
  }, []);
  const handleError = React.useCallback(() => {
    if (connectedRef.current) return;
    setConnectFailed(true);
  }, []);
  const handleMediaDeviceFailure = React.useCallback((failure?: MediaDeviceFailure) => {
    setMicFailure(failure ?? null);
  }, []);

  const takeOver = React.useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    const released = await coordinator.requestTakeover();
    if (!released) return;
    setOwnership('owned');
    // This tab may have been sitting on a cached token since before it yielded, and five minutes
    // is a very reachable gap between handing the mic over and asking for it back.
    retry();
  }, [retry]);

  // The device the user last picked in the debate surfaces, frozen at mount: a changed room
  // options identity makes `<LiveKitRoom>` rebuild its Room, dropping the live call.
  const { selectedAudioInputId } = useDebateMediaSession();
  const initialAudioInputIdRef = React.useRef(selectedAudioInputId);
  const roomOptions = React.useMemo(
    () => ({
      // LiveKit's default reconnect gives up after ~37s; this rides out deploys and brief drops.
      reconnectPolicy: new ExtendedReconnectPolicy(),
      audioCaptureDefaults: initialAudioInputIdRef.current ? { deviceId: initialAudioInputIdRef.current } : undefined,
    }),
    []
  );

  // Every condition the controls themselves render on, because a permission prompt with no voice UI
  // to explain it is worse than the one this hook exists to move. The token covers a backend with
  // LiveKit unconfigured (503) or the endpoint undeployed (404); `opponent` covers a session that
  // somehow arrives without one, which the early return below also refuses to draw. The same device
  // `audioCaptureDefaults` will publish, so the prompt names the microphone the user will actually
  // speak through and the prime cannot fail on a busy system default. `!micIntent` because the
  // prime exists only to move the prompt off the unmute click. Once the user has asked for the
  // microphone, `<LiveKitRoom audio>` is opening it for real and a second request alongside the one
  // already on screen is pure redundancy.
  usePrimedMicrophonePermission(
    !micIntent && voiceActive && ownership === 'owned' && Boolean(join.data) && Boolean(opponent),
    initialAudioInputIdRef.current || undefined
  );

  const opponentName = opponent ? opponent.display_name || opponent.profile_space_id : '';

  // The opponent card opens their personal space rather than navigating to it: this picker is a
  // fixed layer over the app, and leaving it would drop the pair out of the session they are in.
  //
  // The shared hook, not a local copy of its rule. A personal space's own id resolves to an ugly
  // technical record rather than to the person, so it is the space's topic entity that opens — and
  // a click that lands before that lookup does is remembered and finished afterwards, which the
  // local copy got wrong by leaving the card inert until it landed.
  const openOpponentProfile = useOpenDebaterProfile(opponent);

  // No pair to draw, but the viewer is still in a session they must be able to leave — and Leave
  // lives in the header now. The row is the header's, minus everything that needs two people.
  if (!opponent) return leaveAction ? <div className="flex justify-end">{leaveAction}</div> : null;

  const pair: PairContext = {
    local: toHeaderParticipant(local),
    opponent: toHeaderParticipant(opponent) as PairHeaderParticipant,
    opponentName,
    onOpenOpponentSpace: openOpponentProfile,
    leaveAction,
  };

  const headerWith = (voice: PairHeaderVoice) => <RematchPairHeader {...pair} voice={voice} />;

  if (!voiceActive) return headerWith({ kind: 'absent' });

  if (ownership === 'elsewhere') {
    return headerWith({
      kind: 'message',
      message: 'Voice is active in another tab',
      actionLabel: 'Use voice here',
      onAction: takeOver,
    });
  }

  if (ownership === 'pending' || join.isLoading) return headerWith({ kind: 'message', message: 'Connecting voice…' });

  if (join.error) {
    // No backend support: LiveKit unconfigured (503) or the endpoint not deployed yet (404). The
    // picker works exactly as before voice existed. A blocked state (400/403) likewise has no
    // user-facing remedy here.
    if (join.error instanceof GeoChatRequestError && [400, 403, 404].includes(join.error.status)) {
      return headerWith({ kind: 'absent' });
    }
    if (join.error instanceof GeoChatRequestError && join.error.code === 'livekit_not_configured') {
      return headerWith({ kind: 'absent' });
    }
    return headerWith({ kind: 'message', message: 'Voice is unavailable', actionLabel: 'Retry', onAction: retry });
  }

  if (!join.data) return headerWith({ kind: 'message', message: 'Connecting voice…' });

  if (connectFailed) {
    return headerWith({ kind: 'message', message: 'Voice is unavailable', actionLabel: 'Retry', onAction: retry });
  }

  return (
    <LiveKitRoom
      key={connectionEpoch}
      token={join.data.token}
      serverUrl={join.data.url}
      connect
      audio={micIntent && !micFailure}
      video={false}
      options={roomOptions}
      onConnected={handleConnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      className="contents"
    >
      <VoiceHeaderBody
        pair={pair}
        exiting={exiting}
        opponentUserId={opponent.user_id}
        micFailure={micFailure}
        onMicIntentChange={setMicIntent}
        onRetry={retry}
        roomRef={roomRef}
        nudgeSpentRef={nudgeSpentRef}
        noticeDismissed={noticeDismissed}
        onDismissNotice={() => setNoticeDismissed(true)}
        analytics={analytics}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/**
 * GEO-2992 instrumentation.
 *
 * Three numbers, all of them about whether people find the unmute control now that it is inside the
 * content column: the share who ever unmute, how long it takes them, and how often the room has to
 * tell them it cannot hear them. `surface` is on every event so the header's numbers can be read
 * against the corner dock's.
 *
 * `joined` fires once per visit rather than once per connection — a reconnect is not a second
 * participant, and counting it as one deflates every rate computed off it.
 */
function useVoiceAnalytics(sessionId: string, micIntent: boolean) {
  const joinedAtRef = React.useRef<number | null>(null);
  const joinedRef = React.useRef(false);
  const unmutedRef = React.useRef(false);
  // A pair arriving from a recorded debate is unmuted before they get here, so their first "unmute"
  // is not a discovery of anything. Frozen at mount, because `micIntent` is what it measures.
  const joinedMutedRef = React.useRef(!micIntent);

  const recordJoined = React.useCallback(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    joinedAtRef.current = Date.now();
    capture('debate_rematch_voice_joined', {
      session_id: sessionId,
      surface: 'pair_header',
      joined_muted: joinedMutedRef.current,
    });
  }, [sessionId]);

  const recordUnmuted = React.useCallback(() => {
    if (unmutedRef.current || !joinedMutedRef.current) return;
    unmutedRef.current = true;
    const joinedAt = joinedAtRef.current;
    capture('debate_rematch_voice_unmuted', {
      session_id: sessionId,
      surface: 'pair_header',
      seconds_to_first_unmute: joinedAt === null ? null : Math.round((Date.now() - joinedAt) / 1000),
    });
  }, [sessionId]);

  const recordNudge = React.useCallback(
    (kind: 'opponent_talking' | 'talking_while_muted') => {
      capture('debate_rematch_voice_nudge', { session_id: sessionId, surface: 'pair_header', kind });
    },
    [sessionId]
  );

  return React.useMemo(
    () => ({ recordJoined, recordUnmuted, recordNudge }),
    [recordJoined, recordUnmuted, recordNudge]
  );
}

type VoiceAnalytics = ReturnType<typeof useVoiceAnalytics>;

function VoiceHeaderBody({
  pair,
  exiting,
  opponentUserId,
  micFailure,
  onMicIntentChange,
  onRetry,
  roomRef,
  nudgeSpentRef,
  noticeDismissed,
  onDismissNotice,
  analytics,
}: {
  pair: PairContext;
  exiting: boolean;
  opponentUserId: string;
  micFailure: MediaDeviceFailure | null;
  onMicIntentChange: (enabled: boolean) => void;
  onRetry: () => void;
  roomRef: React.MutableRefObject<Room | null>;
  nudgeSpentRef: React.MutableRefObject<boolean>;
  noticeDismissed: boolean;
  onDismissNotice: () => void;
  analytics: VoiceAnalytics;
}) {
  const room = useRoomContext();
  React.useEffect(() => {
    roomRef.current = room;
    return () => {
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [room, roomRef]);

  // No noise filter here, deliberately. Krisp substitutes its own output for the *published* track,
  // so anything that leaves it attached and not producing audio is a microphone that reads unmuted
  // and carries nothing: the room stays connected, the cards stay lit, and the other side hears
  // silence with nothing to click. The raw track depends on no audio context, worklet or processor
  // swap, so this room is on air whenever the connection is. It auto-joins and exists to keep two
  // people talking while they browse claims, and filtering is worth less here than audio that is
  // either working or visibly broken.
  //
  // The debate room keeps Krisp: its pre-join screen means the audio context is already running
  // before a filter attaches, and its recording is worth the filtering.

  // Auto-join means no click stands between arriving and connecting, so the browser's autoplay
  // policy can refuse to play the opponent's audio — silently, with the room otherwise healthy
  // (presence and mute state keep updating). The debate room never hits this because its pre-join
  // screen supplies the gesture. `startAudio()` has to run from a real user event, so the header
  // asks for one.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);

  const connectionState = useConnectionState();
  // The room reports Disconnected both before the first connect and after the reconnect policy
  // gives up; only the second deserves a Retry.
  const [everConnected, setEverConnected] = React.useState(false);
  React.useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      setEverConnected(true);
      analytics.recordJoined();
    }
  }, [analytics, connectionState]);

  const remoteParticipants = useRemoteParticipants();
  const opponentParticipant = remoteParticipants.find(participant => participant.identity === opponentUserId) ?? null;

  // Lifted out of the opponent's card so the local mute button can answer to it. `useIsSpeaking`
  // needs a participant to subscribe to, which is why the reporting lives in the connected card
  // and the reset for a departed opponent lives here.
  const [opponentAudible, setOpponentAudible] = React.useState(false);
  React.useEffect(() => {
    if (!opponentParticipant) setOpponentAudible(false);
  }, [opponentParticipant]);

  const [opponentMuted, setOpponentMuted] = React.useState(true);

  /**
   * Whether the opponent has been in the room at all this visit.
   *
   * The unmute notice is gated on this rather than on them being here right now. "Nobody to talk
   * to" is a reason never to raise it, but once it is up, taking it away again when the other
   * person drops — for a reconnect, or for good — moves everything under it at a moment the viewer
   * did nothing to cause. What the notice says is still true of the visit: you are muted, and there
   * is somebody you came here to talk to.
   */
  const [opponentEverJoined, setOpponentEverJoined] = React.useState(false);
  React.useEffect(() => {
    if (opponentParticipant) setOpponentEverJoined(true);
  }, [opponentParticipant]);

  // Everything below used to live in a `ConnectedPairHeader` this rendered instead of a message.
  // Swapping one component for another at the same position is a remount, and this subtree is the
  // wrong place for one: it would close an open Audio settings popover, drop focus from the Leave
  // button that now sits in the card, and re-insert the `role="status"` regions with their text
  // already in them — the one thing those regions are shaped to avoid. So the hooks run
  // unconditionally and the connection state picks the `voice` rather than the component.
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const micFailed = Boolean(micFailure);
  const muted = !isMicrophoneEnabled || micFailed;
  // Muting publishes nothing, but it does not retract the active-speaker update that came just
  // before it, so the ring has to answer to the mute state as well or it can stay lit on a
  // microphone the room has stopped hearing.
  const localSpeaking = useIsSpeaking(localParticipant) && isMicrophoneEnabled && !micFailed;

  // On the microphone actually opening, not on the click that asked for it. A denial or a busy
  // device rejects, and counting the attempt would inflate the very rate this measures — and spend
  // the one-shot, so the retry that does succeed would never be counted.
  React.useEffect(() => {
    if (isMicrophoneEnabled && !micFailed) analytics.recordUnmuted();
  }, [analytics, isMicrophoneEnabled, micFailed]);

  const setMicrophone = React.useCallback(
    (next: boolean) => {
      // Record the intent before publishing it, so a reconnect restores this choice rather than the
      // join-time default.
      onMicIntentChange(next);
      // Unmuting is the first thing to open the microphone, so this is where a denial lands.
      // LiveKit reports it through `onMediaDeviceFailure`; catching only keeps the rejection from
      // surfacing as an unhandled promise.
      void localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
    },
    [localParticipant, onMicIntentChange]
  );

  // A dead microphone has its own note in the card, which says more than a nudge could.
  const { visible: nudgeVisible, dismiss: dismissNudge } = useMutedNudge(
    muted && !micFailed,
    opponentAudible,
    nudgeSpentRef
  );

  React.useEffect(() => {
    if (nudgeVisible) analytics.recordNudge('opponent_talking');
  }, [analytics, nudgeVisible]);

  const unmute = React.useCallback(() => {
    dismissNudge();
    onDismissNotice();
    setMicrophone(true);
  }, [dismissNudge, onDismissNotice, setMicrophone]);

  const toggle = React.useCallback(() => {
    // Whichever way this click goes, the user has just found the control — so the notice and the
    // nudge that exist to point at it have nothing left to say. Dismissing here also covers two
    // states they would otherwise misread: muting on purpose looks exactly like the join default,
    // and unmuting leaves `isMicrophoneEnabled` false for as long as the permission dialog is open,
    // both of which would leave them up in front of someone already dealing with the microphone.
    dismissNudge();
    onDismissNotice();
    setMicrophone(!isMicrophoneEnabled);
  }, [dismissNudge, isMicrophoneEnabled, onDismissNotice, setMicrophone]);

  /**
   * What the room is doing, when that outranks what the microphone is doing.
   *
   * Blocked playback comes last but outranks the rest of the connected state: the room is fine, the
   * opponent may well be talking, and the viewer simply cannot hear it until they click.
   */
  const connectionMessage = ((): Extract<PairHeaderVoice, { kind: 'message' }> | null => {
    // Not while leaving. Ending the session can drop the room within the second it takes the
    // redirect to land, and swapping the controls for "Voice disconnected · Retry" on the way out
    // is both a layout shift and an offer of something the viewer cannot want.
    if (exiting) return null;
    if (connectionState === ConnectionState.Disconnected && everConnected) {
      return { kind: 'message', message: 'Voice disconnected', actionLabel: 'Retry', onAction: onRetry };
    }
    if (connectionState !== ConnectionState.Connected) {
      const reconnecting =
        connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;
      return { kind: 'message', message: reconnecting ? 'Reconnecting…' : 'Connecting voice…' };
    }
    if (!canPlayAudio) {
      return {
        kind: 'message',
        message: 'Audio is blocked',
        actionLabel: 'Enable audio',
        onAction: () => void startAudio(),
      };
    }
    return null;
  })();

  const opponentState: PairMicState = !opponentParticipant
    ? 'waiting'
    : opponentMuted
      ? 'muted'
      : opponentAudible
        ? 'talking'
        : 'live';

  const voice: PairHeaderVoice = connectionMessage ?? {
    kind: 'live',
    muted,
    localSpeaking,
    micFailureMessage: micFailure ? micFailureMessage(micFailure) : null,
    onRetryMic: onRetry,
    controls: <LocalAudioControls room={room} muted={muted} micFailure={micFailure} onToggle={toggle} />,
    opponentState,
    // See `TALKING_WHILE_MUTED`: the states are built, the detector is a product call.
    talkingWhileMuted: TALKING_WHILE_MUTED,
  };

  /**
   * The room is gone, rather than merely away.
   *
   * A blip does not make the viewer un-muted or the other person un-paired, and unmuting through it
   * records an intent the reconnect restores — so the notice rides a reconnect out rather than
   * taking everything under it with it. A room that has given up is different: its Unmute is a
   * button that cannot work, and pressing it would still spend the notice's one dismissal on a
   * click that did nothing. Not while `exiting`, where nothing changes shape at all.
   */
  const roomGone = !exiting && connectionState === ConnectionState.Disconnected && everConnected;

  // Only while muted, only once there has been somebody to talk to, and only until the viewer has
  // answered it once.
  const notice =
    muted && !micFailed && !noticeDismissed && opponentEverJoined && !roomGone
      ? { onUnmute: unmute, onDismiss: onDismissNotice }
      : null;

  const toast: PairHeaderToast | null =
    !connectionMessage && nudgeVisible ? { kind: 'opponent-talking', onUnmute: unmute, onDismiss: dismissNudge } : null;

  return (
    <>
      {/* Dropped while the room is not up, not only when the opponent leaves. Its cleanup is what
          clears "they are talking", and without that a value left over from before a blip is still
          true on the render where the viewer comes back muted — which fires the nudge at a silent
          room. The header itself stays mounted through all of it; only this subscription does not. */}
      {opponentParticipant && !connectionMessage ? (
        <OpponentPresence
          participant={opponentParticipant}
          onAudibleChange={setOpponentAudible}
          onMutedChange={setOpponentMuted}
        />
      ) : null}
      <RematchPairHeader {...pair} voice={voice} notice={notice} toast={toast} />
    </>
  );
}

/**
 * Subscribes to the opponent's speaking and mute state and reports it upward. Renders nothing:
 * `useIsSpeaking`/`useIsMuted` need a participant, and there is nothing to subscribe to until the
 * opponent actually joins the room.
 */
function OpponentPresence({
  participant,
  onAudibleChange,
  onMutedChange,
}: {
  participant: RemoteParticipant;
  onAudibleChange: (audible: boolean) => void;
  onMutedChange: (muted: boolean) => void;
}) {
  const speaking = useIsSpeaking(participant);
  // Left to `useIsMuted` alone, deliberately. Reading `getTrackPublication` alongside it looks
  // like it would fix the one frame where a peer who joined muted reads as unmuted, but that read
  // is not reactive on its own and pins the chip to muted for the rest of the session — taking
  // the speaking ring with it, since `audible` is gated on the same value.
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  // Muted outranks speaking: the server clears `isSpeaking` only on its next speaker update, so a
  // "Talking" chip that ignored the mute state would sit lit beside one that has already gone red.
  const audible = speaking && !muted;

  // The cleanup matters: the header swaps these states out for a message while reconnecting,
  // without the opponent ever leaving. Without it the last "they are talking" survives the blip,
  // and the remounted button fires its nudge at an opponent who is sitting in silence.
  React.useEffect(() => {
    onAudibleChange(audible);
    return () => onAudibleChange(false);
  }, [audible, onAudibleChange]);

  // Reset on unmount for the same reason `onAudibleChange` does: the last value outlives the
  // participant otherwise, and somebody who leaves unmuted and rejoins muted reads as live for a
  // frame. Muted is the safe default — it is how everyone joins.
  React.useEffect(() => {
    onMutedChange(muted);
    return () => onMutedChange(true);
  }, [muted, onMutedChange]);

  return null;
}

/**
 * Why "talking while muted" is not detected here.
 *
 * The toast the design asks for needs voice-activity detection on the viewer's own microphone while
 * they are muted, and there is no track to run it on. `setMicrophoneEnabled(false)` sets
 * `mediaStreamTrack.enabled = false`, and a disabled track produces silence by specification — so
 * LiveKit's own analyser reads zero for exactly as long as the state being detected lasts. The
 * primed permission stream cannot stand in either: it is stopped the moment it arrives, on purpose.
 *
 * Detecting it therefore means holding a second `getUserMedia` stream open for the whole session —
 * keeping the device seized and the browser's recording indicator lit next to a card that reads
 * "Muted". That is the exact thing joining muted exists to avoid, so it is a product call rather
 * than an implementation detail, and it is not made here. The states it drives are built and
 * reachable (`talkingWhileMuted` on the header, and the toast beneath it); wiring a detector is one
 * boolean.
 */
const TALKING_WHILE_MUTED: boolean = false;

export function micFailureMessage(failure: MediaDeviceFailure): string {
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return 'Microphone blocked. Allow it in your browser, then try again.';
    case MediaDeviceFailure.NotFound:
      return 'No microphone found. Connect one, then try again.';
    case MediaDeviceFailure.DeviceInUse:
      return 'Your microphone is in use by another app.';
    default:
      return 'Microphone unavailable.';
  }
}

/**
 * The user's own control: a labelled mute toggle and the audio settings, joined into one pill by a
 * hairline.
 *
 * Labelled, which the dock's version was not. An icon-only microphone in a row of participant state
 * reads as a status light — which is precisely how people were reading it, and why nobody pressed
 * it. "Unmute" is a verb, and a verb on a filled pill is a button.
 */
function LocalAudioControls({
  room,
  muted,
  micFailure,
  onToggle,
}: {
  room: Room;
  muted: boolean;
  micFailure: MediaDeviceFailure | null;
  onToggle: () => void;
}) {
  const isMobile = useIsMobileCallLayout();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const settings = useVoiceAudioSettings(room, micFailure);

  // Muted is the state the user lands in without choosing it, so it carries the primary treatment:
  // a filled pill saying what pressing it does. Live is the state they chose, so its Mute is
  // secondary — visible, but not asking for anything.
  const primary = muted && !micFailure;

  const settingsTrigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label="Audio settings"
      title="Audio settings"
      aria-expanded={open}
      onClick={isMobile ? () => setOpen(current => !current) : undefined}
      className={cx(
        // Square on the pill's own height, so the joined control is one shape rather than a pill
        // with a tab on the end.
        'grid size-6 shrink-0 place-items-center rounded-r-full transition-colors',
        primary
          ? 'border-l border-grey-05 bg-text text-white hover:opacity-80'
          : 'border border-l-0 border-grey-02 bg-white text-grey-04 hover:text-text'
      )}
    >
      <span className={cx('grid place-items-center transition-transform', open && 'rotate-180')}>
        <ChevronDownSmall />
      </span>
    </button>
  );

  return (
    <span className="flex h-6 shrink-0 items-center">
      <button
        type="button"
        // Both derived from `muted`, like the glyph and the disabled state. Deriving the label from
        // `isMicrophoneEnabled` instead lets a failed microphone announce "Mute microphone" while
        // showing a slashed icon on a button that cannot be pressed.
        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        title={micFailure ? micFailureMessage(micFailure) : muted ? 'Unmute microphone' : 'Mute microphone'}
        onClick={onToggle}
        disabled={Boolean(micFailure)}
        className={cx(
          // The opponent's mic chip, to the pixel — see `PAIR_PILL`. The two sit at the same
          // height in mirrored cards, so any difference between them reads as an accident.
          PAIR_PILL,
          'rounded-l-full transition',
          micFailure
            ? 'border border-r-0 border-grey-02 bg-white text-red-01 opacity-60'
            : primary
              ? 'bg-text text-white hover:opacity-80'
              : 'border border-r-0 border-grey-02 bg-white text-text hover:text-grey-04',
          'disabled:cursor-default'
        )}
      >
        <MicrophoneIcon muted={muted} />
        {muted ? 'Unmute' : 'Mute'}
      </button>
      {isMobile ? (
        <>
          {settingsTrigger}
          <MobileSettingsSheet title="Audio settings" open={open} onOpenChange={setOpen} returnFocusRef={triggerRef}>
            <AudioSettings {...settings} framed />
          </MobileSettingsSheet>
        </>
      ) : (
        <DesktopSettingsPopover open={open} onOpenChange={setOpen} trigger={settingsTrigger} triggerRef={triggerRef}>
          <AudioSettings {...settings} />
        </DesktopSettingsPopover>
      )}
    </span>
  );
}

function DesktopSettingsPopover({
  open,
  onOpenChange,
  trigger,
  triggerRef,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  // Radix's default portal wrapper is globally capped at z-60, below this picker's z-[150].
  const elevatedPopoverPortal = useElevatedPopoverPortal();

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      {elevatedPopoverPortal && (
        <Popover.Portal container={elevatedPopoverPortal}>
          <Popover.Content
            role="dialog"
            aria-label="Audio settings"
            side="bottom"
            align="end"
            sideOffset={12}
            collisionPadding={16}
            onCloseAutoFocus={event => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
            className="z-[170] max-h-[360px] w-[248px] overflow-y-auto rounded-lg border border-grey-02 bg-white p-1 text-left text-text shadow-lg outline-none"
          >
            {children}
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

/**
 * Feeds the settings panel, and carries what the user picks into the debate that follows.
 *
 * The device lists and the live switching come from LiveKit rather than the app-wide media session,
 * which enumerates nothing without an open preview — one this header deliberately never starts.
 * Real device labels need microphone permission: usually already granted, since the pair arrives
 * from a debate, and otherwise granted by the up-front prime. What can still leave the list on its
 * "Microphone 1" fallbacks is timing, not the mute default — this enumerates once at mount and then
 * only on `devicechange`, and the room reaches Connected well before a user answers the prompt.
 * Asking again here is worse than the fallback labels: see the note on `requestPermissions` below.
 * Each choice is written back to that session, which is what the debate room's pre-join screen
 * reads, so whatever the pair settled on while browsing claims is still selected when they walk
 * into the debate. Writing the microphone back cannot grab it a second time: `ensurePreview` bails
 * unless a preview session is open.
 */
function useVoiceAudioSettings(room: Room, micFailure: MediaDeviceFailure | null) {
  const { changeAudioInput, changeAudioOutput, audioOutputError } = useDebateMediaSession();
  // `requestPermissions` defaults to true, and enumerating with it calls `getUserMedia` whenever a
  // device label is blank — which is exactly the state a denied microphone leaves them in. That
  // second prompt has no user gesture behind it, so it fails, and its rejection empties the list:
  // the panel would offer no microphones at all precisely when the user came to fix their
  // microphone. The room already holds permission whenever the mic did open, so the labels are real
  // without asking again.
  const microphones = useMediaDeviceSelect({ kind: 'audioinput', room, requestPermissions: false });
  const speakers = useMediaDeviceSelect({ kind: 'audiooutput', room, requestPermissions: false });

  const selectMicrophone = (deviceId: string) => {
    void microphones.setActiveMediaDevice(deviceId);
    changeAudioInput(deviceId);
  };

  const selectSpeaker = (deviceId: string) => {
    void speakers.setActiveMediaDevice(deviceId);
    void changeAudioOutput(deviceId);
  };

  // Browsers without `setSinkId` enumerate no outputs at all; show the same disabled "System
  // default" row the pre-join screen falls back to rather than an empty list.
  const audioOutputSupported = speakers.devices.length > 0;

  return {
    audioInputDevices: toDeviceOptions(microphones.devices, 'Microphone'),
    audioOutputDevices: audioOutputSupported
      ? toDeviceOptions(speakers.devices, 'Speaker')
      : [systemDefaultAudioOutput],
    selectedAudioInputId: microphones.activeDeviceId,
    selectedAudioOutputId: speakers.activeDeviceId,
    audioOutputSupported,
    // The panel is where someone goes to fix their audio, so it is where the failures belong.
    error: micFailure ? micFailureMessage(micFailure) : audioOutputError,
    onAudioInputChange: selectMicrophone,
    onAudioOutputChange: selectSpeaker,
  };
}

function toDeviceOptions(devices: MediaDeviceInfo[], fallbackLabel: string): MediaDeviceOption[] {
  return devices.map((device, index) => ({
    deviceId: device.deviceId,
    groupId: device.groupId,
    kind: device.kind as MediaDeviceOption['kind'],
    label: device.label || `${fallbackLabel} ${index + 1}`,
  }));
}
