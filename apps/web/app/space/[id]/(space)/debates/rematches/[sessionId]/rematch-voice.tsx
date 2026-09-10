'use client';

import * as Popover from '@radix-ui/react-popover';
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
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { ConnectionState, MediaDeviceFailure, type Room, Track } from 'livekit-client';

import { useIsMobileCallLayout } from '~/core/community-calls/use-is-mobile-call-layout';
import type { DebateRematchParticipant, DebateRematchSession } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';
import { AudioSettings, MobileSettingsSheet } from '~/core/debates/audio-settings';
import { MicrophoneIcon } from '~/core/debates/debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '~/core/debates/debate-room-ownership';
import { debateQueryKeys, useGeoChatAuth, useRematchLiveKitJoin } from '~/core/debates/hooks';
import { type MediaDeviceOption, systemDefaultAudioOutput, useDebateMediaSession } from '~/core/debates/media-session';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { Avatar } from '~/design-system/avatar';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import type { RemoteParticipant } from 'livekit-client';

// Voice auto-joins muted. Nothing here asked the user to open their microphone — the dock connects
// on its own the moment they land — and an open mic they never chose reads as intrusive. They still
// hear the other side immediately; unmuting is one click on the local row.
//
// Joining muted also means `<LiveKitRoom>` never calls `getUserMedia` on connect, so the picker no
// longer seizes the microphone (or prompts for it) behind a call the user has running elsewhere.
const JOIN_MIC_ENABLED = false;

/** How long "You're muted" stays up before it stops being information and starts being noise. */
const MUTED_NUDGE_MS = 4000;

type OwnershipState = 'pending' | 'owned' | 'elsewhere';

/** What the opponent's chip is saying: not here yet, here and muted, or here and live. */
type OpponentMicState = 'waiting' | 'muted' | 'live';

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
 * Joining muted means nothing would otherwise call `getUserMedia` until the user clicks unmute —
 * and a permission dialog that lands the moment someone starts talking is its own kind of
 * intrusive. Priming it here moves the prompt to a point where the user is not mid-sentence, and
 * leaves the unmute click instant. It also gives the settings panel real device labels, which
 * `enumerateDevices` withholds until the origin has been granted the microphone once.
 *
 * The stream is stopped as soon as it arrives, and stopped even if this unmounts first: holding it
 * would keep the device seized and the browser's recording indicator lit next to a dock that says
 * muted, which is the whole thing this flow is trying not to do.
 *
 * A denial needs nothing here. The dock is listen-only either way, and the unmute button reports
 * it through LiveKit's `onMediaDeviceFailure` like any other microphone failure.
 */
function usePrimedMicrophonePermission(enabled: boolean, deviceId?: string) {
  React.useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
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
 * "You're muted", once.
 *
 * The pair lands here muted by a default they did not choose, so the first time the other person
 * actually says something is both when that default is most likely to surprise them and when a
 * silent reply starts reading as being ignored. Firing on the opponent's voice rather than on the
 * user's own keeps the microphone closed: a muted track publishes silence, so detecting that the
 * user is talking would mean holding a second live stream open for the whole session.
 *
 * Once per visit, and only while muted — a nudge that returns on every turn is just a mute button
 * that shouts. `spentRef` is owned by the dock's outermost component rather than declared here on
 * purpose: this hook's component is unmounted and rebuilt by every reconnect and every "audio is
 * blocked" detour, so a local ref would quietly reset the one-shot several times a session.
 */
function useMutedNudge(muted: boolean, opponentAudible: boolean, spentRef: React.MutableRefObject<boolean>) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (spentRef.current || !muted || !opponentAudible) return;
    spentRef.current = true;
    setVisible(true);
  }, [muted, opponentAudible]);

  // The dismissal clock is deliberately its own effect, keyed only on `visible`. Sharing the
  // effect above would put `opponentAudible` in its dependencies, and the opponent stops talking
  // within a second or two: the cleanup would clear the pending timeout, the one-shot gate would
  // early-return instead of re-arming it, and the bubble would sit there for the rest of the
  // session.
  React.useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), MUTED_NUDGE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  // Unmuting is what the nudge was asking for; leaving it up afterwards is just noise.
  React.useEffect(() => {
    if (!muted) setVisible(false);
  }, [muted]);

  return visible;
}

/**
 * The floating voice channel for the rematch picker: the pair lands here from "debate again" or a
 * profile challenge, and this keeps them talking while they browse claims. Audio-only; mute is a
 * local track toggle and the opponent's state comes straight from LiveKit participant events.
 *
 * Degrades to nothing when the backend has no LiveKit config (503), predates the endpoint (404),
 * or the session has left a voice-capable status. A denied microphone keeps the room in
 * listen-only mode rather than tearing it down.
 */
export function RematchVoicePill({
  session,
  currentUserId,
}: {
  session: DebateRematchSession;
  currentUserId: string;
}) {
  const voiceActive = voiceCapable(session.status);
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
  const [micIntent, setMicIntent] = React.useState(JOIN_MIC_ENABLED);

  // Owned here, where nothing below the page itself can remount it, so "You're muted" is shown
  // once per visit rather than once per connection.
  const nudgeSpentRef = React.useRef(false);

  // Recovery from a dead connection: mint a fresh token and remount the room. Handing a mounted
  // `<LiveKitRoom>` a new token would tear it down mid-flight, so the epoch key remounts instead.
  //
  // `resetQueries`, not `invalidateQueries`: rematch tokens live five minutes, and an invalidated
  // query keeps serving its old data while the refetch is in flight. The epoch bump is synchronous,
  // so the room would remount around the token that just failed — by now almost certainly the
  // expired one. Resetting clears `join.data`, and the dock renders nothing until the new token
  // lands. A retry is also the user's second run at a denied microphone, so the failure latch has
  // to come off with it or the mute button stays disabled until a page reload.
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
  // never re-runs on its own, so the dock would sit on "Connecting voice…" forever while the
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
      audioCaptureDefaults: initialAudioInputIdRef.current
        ? { deviceId: initialAudioInputIdRef.current }
        : undefined,
    }),
    []
  );

  // Every condition the dock itself renders on, because a permission prompt on a page with no
  // voice UI to explain it is worse than the one this hook exists to move. The token covers a
  // backend with LiveKit unconfigured (503) or the endpoint undeployed (404); `opponent` covers a
  // session that somehow arrives without one, which the early return below also refuses to draw.
  usePrimedMicrophonePermission(voiceActive && ownership === 'owned' && Boolean(join.data) && Boolean(opponent));

  if (!voiceActive || !opponent) return null;

  if (ownership === 'elsewhere') {
    return <VoiceDockMessage message="Voice is active in another tab" actionLabel="Use voice here" onAction={takeOver} />;
  }

  if (ownership === 'pending' || join.isLoading) return null;

  if (join.error) {
    // No backend support: LiveKit unconfigured (503) or the endpoint not deployed yet (404). The
    // picker works exactly as before voice existed. A blocked state (400/403) likewise has no
    // user-facing remedy here.
    if (join.error instanceof GeoChatRequestError && [400, 403, 404].includes(join.error.status)) {
      return null;
    }
    if (join.error instanceof GeoChatRequestError && join.error.code === 'livekit_not_configured') {
      return null;
    }
    return <VoiceDockMessage message="Voice is unavailable" actionLabel="Retry" onAction={retry} />;
  }

  if (!join.data) return null;

  if (connectFailed) {
    return <VoiceDockMessage message="Voice is unavailable" actionLabel="Retry" onAction={retry} />;
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
      <VoiceDockBody
        local={local}
        opponent={opponent}
        micFailure={micFailure}
        onMicIntentChange={setMicIntent}
        onRetry={retry}
        roomRef={roomRef}
        nudgeSpentRef={nudgeSpentRef}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/**
 * The dock chrome. Desktop is a card pinned to the bottom-right corner; mobile is a bar across the
 * bottom of the viewport. Both sit above the picker overlay (z-[150]) and below the entity side
 * panel (z-200), so an opened claim covers the dock while the audio keeps playing underneath it.
 */
function VoiceDockShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileCallLayout();

  if (isMobile) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[160] border-t border-grey-02 bg-white px-5 pt-[9px] pb-[max(9px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    );
  }

  return (
    <div className="fixed right-5 bottom-5 z-[160] w-[200px] rounded-[20px] border border-grey-02 bg-white p-3 shadow-[0px_8px_12.5px_rgba(0,0,0,0.09)]">
      {children}
    </div>
  );
}

/** Everything the dock says when it has no two-participant state to show yet. */
function VoiceDockMessage({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <VoiceDockShell>
      <div className="flex min-h-7 items-center justify-between gap-2">
        {/* Every one of these appears without the user doing anything — the call drops, the browser
            refuses playback — so it has to announce itself rather than wait to be found. */}
        <span role="status" className="min-w-0 truncate text-metadata text-grey-04">
          {message}
        </span>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadataMedium text-white transition-opacity hover:opacity-80"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </VoiceDockShell>
  );
}

function VoiceDockBody({
  local,
  opponent,
  micFailure,
  onMicIntentChange,
  onRetry,
  roomRef,
  nudgeSpentRef,
}: {
  local: DebateRematchParticipant | null;
  opponent: DebateRematchParticipant;
  micFailure: MediaDeviceFailure | null;
  onMicIntentChange: (enabled: boolean) => void;
  onRetry: () => void;
  roomRef: React.MutableRefObject<Room | null>;
  nudgeSpentRef: React.MutableRefObject<boolean>;
}) {
  const isMobile = useIsMobileCallLayout();
  const room = useRoomContext();
  React.useEffect(() => {
    roomRef.current = room;
    return () => {
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [room, roomRef]);

  // No noise filter here, deliberately. Krisp substitutes its own output for the *published* track,
  // so anything that leaves it attached and not producing audio is a microphone that reads unmuted
  // and carries nothing: the room stays connected, the pills stay lit, and the other side hears
  // silence with nothing to click. The raw track depends on no audio context, worklet or processor
  // swap, so this dock is on air whenever the room is. It auto-joins and exists to keep two people
  // talking while they browse claims, and filtering is worth less here than audio that is either
  // working or visibly broken.
  //
  // The debate room keeps Krisp: its pre-join screen means the audio context is already running
  // before a filter attaches, and its recording is worth the filtering.

  // Auto-join means no click stands between arriving and connecting, so the browser's autoplay
  // policy can refuse to play the opponent's audio — silently, with the room otherwise healthy
  // (presence and mute state keep updating). The debate room never hits this because its pre-join
  // screen supplies the gesture. `startAudio()` has to run from a real user event, so the dock
  // asks for one.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);

  const connectionState = useConnectionState();
  // The room reports Disconnected both before the first connect and after the reconnect policy
  // gives up; only the second deserves a Retry.
  const [everConnected, setEverConnected] = React.useState(false);
  React.useEffect(() => {
    if (connectionState === ConnectionState.Connected) setEverConnected(true);
  }, [connectionState]);

  const remoteParticipants = useRemoteParticipants();
  const opponentParticipant = remoteParticipants.find(participant => participant.identity === opponent.user_id) ?? null;
  const opponentName = opponent.display_name || opponent.profile_space_id;

  // Lifted out of the opponent's row so the local mute button can answer to it. `useIsSpeaking`
  // needs a participant to subscribe to, which is why the reporting lives in the connected row
  // and the reset for a departed opponent lives here.
  const [opponentAudible, setOpponentAudible] = React.useState(false);
  React.useEffect(() => {
    if (!opponentParticipant) setOpponentAudible(false);
  }, [opponentParticipant]);

  if (connectionState === ConnectionState.Disconnected && everConnected) {
    return <VoiceDockMessage message="Voice disconnected" actionLabel="Retry" onAction={onRetry} />;
  }

  if (connectionState !== ConnectionState.Connected) {
    const reconnecting =
      connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;
    return <VoiceDockMessage message={reconnecting ? 'Reconnecting…' : 'Connecting voice…'} />;
  }

  // Blocked playback outranks everything else the dock could say: the room is fine, the opponent
  // may well be talking, and the viewer simply cannot hear it until they click.
  if (!canPlayAudio) {
    return <VoiceDockMessage message="Audio is blocked" actionLabel="Enable audio" onAction={() => void startAudio()} />;
  }

  const localRow = (
    <LocalRow
      local={local}
      room={room}
      micFailure={micFailure}
      onMicIntentChange={onMicIntentChange}
      opponentAudible={opponentAudible}
      nudgeSpentRef={nudgeSpentRef}
    />
  );
  const opponentRow = (
    <OpponentRow
      participant={opponentParticipant}
      opponent={opponent}
      name={opponentName}
      onAudibleChange={setOpponentAudible}
    />
  );
  // The mute button can only go dim and grow a tooltip, which says nothing to a keyboard or screen
  // reader user — a disabled control is out of the tab order. The reason goes in the dock itself,
  // along with the only way back: retrying remounts the room and asks for the microphone again.
  const micNote = micFailure ? <MicFailureNote failure={micFailure} onRetry={onRetry} /> : null;

  if (isMobile) {
    return (
      <VoiceDockShell>
        <div className="flex items-center gap-3">
          <div className="flex h-7 min-w-0 flex-1 items-center justify-between gap-2">{localRow}</div>
          <span aria-hidden className="h-7 w-px shrink-0 rounded-xs bg-grey-02" />
          <div className="flex h-7 min-w-0 flex-1 items-center justify-between gap-2">{opponentRow}</div>
        </div>
        {micNote}
      </VoiceDockShell>
    );
  }

  return (
    <VoiceDockShell>
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center justify-between gap-2">{localRow}</div>
        <span aria-hidden className="h-px w-full bg-divider" />
        <div className="flex h-7 items-center justify-between gap-2">{opponentRow}</div>
        {micNote}
      </div>
    </VoiceDockShell>
  );
}

function micFailureMessage(failure: MediaDeviceFailure): string {
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

/** Why the mute button is dim, and the way out of listen-only. */
function MicFailureNote({ failure, onRetry }: { failure: MediaDeviceFailure; onRetry: () => void }) {
  return (
    <p role="status" className="text-footnote text-grey-04">
      <span className="text-red-01">{micFailureMessage(failure)}</span>{' '}
      <button type="button" onClick={onRetry} className="text-footnoteMedium text-text underline">
        Try again
      </button>
    </p>
  );
}

function ParticipantIdentity({
  name,
  avatarUrl,
  avatarValue,
  speaking = false,
  dimmed = false,
}: {
  name: string;
  avatarUrl?: string | null;
  avatarValue?: string;
  speaking?: boolean;
  dimmed?: boolean;
}) {
  return (
    <span className={cx('flex min-w-0 flex-1 items-center gap-2', dimmed && 'opacity-60')}>
      {/* The size lives on the wrapper, not on `<Avatar>`: its `size` prop only reaches the
          generated fallback, while a real avatar renders `h-full w-full` and takes whatever box it
          is given. Without one it stretches to the image's intrinsic dimensions. */}
      <span
        className={cx(
          'inline-flex size-4 shrink-0 overflow-hidden rounded-full',
          speaking && 'ring-1 ring-green ring-offset-1 ring-offset-white'
        )}
      >
        <Avatar avatarUrl={avatarUrl ?? null} value={avatarValue ?? name} size={16} alt="" />
      </span>
      <span title={name} className="min-w-0 truncate text-metadata text-text">
        {name}
      </span>
    </span>
  );
}

/**
 * The user's own row. Same green ring as the opponent gets: without it the speaking cue reads as a
 * fact about the other person rather than about who currently has the floor, and there is nothing
 * to check when you suspect the room cannot hear you.
 */
function LocalRow({
  local,
  room,
  micFailure,
  onMicIntentChange,
  opponentAudible,
  nudgeSpentRef,
}: {
  local: DebateRematchParticipant | null;
  room: Room;
  micFailure: MediaDeviceFailure | null;
  onMicIntentChange: (enabled: boolean) => void;
  opponentAudible: boolean;
  nudgeSpentRef: React.MutableRefObject<boolean>;
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  // Muting publishes nothing, but it does not retract the active-speaker update that came just
  // before it, so the ring has to answer to the mute state as well or it can stay lit on a
  // microphone the room has stopped hearing.
  const speaking = useIsSpeaking(localParticipant) && isMicrophoneEnabled && !micFailure;

  return (
    <>
      <ParticipantIdentity
        name="You"
        avatarUrl={local?.avatar_cid}
        avatarValue={local?.profile_space_id}
        speaking={speaking}
      />
      <LocalAudioControls
        room={room}
        micFailure={micFailure}
        onMicIntentChange={onMicIntentChange}
        opponentAudible={opponentAudible}
        nudgeSpentRef={nudgeSpentRef}
      />
    </>
  );
}

function OpponentRow({
  participant,
  opponent,
  name,
  onAudibleChange,
}: {
  participant: RemoteParticipant | null;
  opponent: DebateRematchParticipant;
  name: string;
  onAudibleChange: (audible: boolean) => void;
}) {
  if (!participant) {
    return (
      <>
        <ParticipantIdentity name={name} avatarUrl={opponent.avatar_cid} avatarValue={opponent.profile_space_id} dimmed />
        <OpponentMicChip state="waiting" name={name} />
      </>
    );
  }
  return (
    <ConnectedOpponentRow
      participant={participant}
      opponent={opponent}
      name={name}
      onAudibleChange={onAudibleChange}
    />
  );
}

/**
 * Split out because `useIsSpeaking`/`useIsMuted` need a participant — there is nothing to subscribe
 * to until the opponent actually joins the room.
 */
function ConnectedOpponentRow({
  participant,
  opponent,
  name,
  onAudibleChange,
}: {
  participant: RemoteParticipant;
  opponent: DebateRematchParticipant;
  name: string;
  onAudibleChange: (audible: boolean) => void;
}) {
  const speaking = useIsSpeaking(participant);
  // Left to `useIsMuted` alone, deliberately. Reading `getTrackPublication` alongside it looks
  // like it would fix the one frame where a peer who joined muted reads as unmuted, but that read
  // is not reactive on its own and pins the chip to muted for the rest of the session — taking
  // the speaking ring with it, since `audible` is gated on the same value.
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });
  // Muted outranks speaking for the same reason it does on the local row: the server clears
  // `isSpeaking` only on its next speaker update, so a ring that ignored the mute state would sit
  // lit beside a chip that has already gone red.
  const audible = speaking && !muted;

  // The local mute button needs to know when the other person is actually making sound, and this
  // is the only place subscribed to it.
  //
  // The cleanup matters: the dock swaps these rows out for a message while reconnecting, without
  // the opponent ever leaving. Without it the last "they are talking" survives the blip, and the
  // remounted mute button fires its nudge at an opponent who is sitting in silence.
  React.useEffect(() => {
    onAudibleChange(audible);
    return () => onAudibleChange(false);
  }, [audible, onAudibleChange]);

  return (
    <>
      <ParticipantIdentity
        name={name}
        avatarUrl={opponent.avatar_cid}
        avatarValue={opponent.profile_space_id}
        speaking={audible}
      />
      <OpponentMicChip state={muted ? 'muted' : 'live'} name={name} />
    </>
  );
}

/** Red when the other person is muted, green when they are live, neutral before they arrive. */
function OpponentMicChip({ state, name }: { state: OpponentMicState; name: string }) {
  const label =
    state === 'waiting' ? `Waiting for ${name} to join` : state === 'muted' ? `${name} is muted` : `${name} is unmuted`;

  return (
    <>
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cx(
          'grid h-7 shrink-0 place-items-center rounded-full px-2 [&>svg]:size-3',
          state === 'waiting' && 'bg-grey-01 text-grey-04',
          state === 'muted' && 'bg-errorTertiary text-red-01',
          state === 'live' && 'bg-successTertiary text-green'
        )}
      >
        <MicrophoneIcon muted={state !== 'live'} />
      </span>
      {/* The chip's own label carries the state, but nothing announces it changing: the opponent
          arrives and mutes on their own schedule, with no action here to hang an update on. A live
          region whose text changes is the only reliable way to hear about it. */}
      <span role="status" className="sr-only">
        {label}
      </span>
    </>
  );
}

/**
 * The bubble over the unmute button. `pointer-events-none` on purpose: it sits directly above the
 * one control it is asking the user to press, and must never be the thing that swallows the click.
 */
function MutedNudge() {
  return (
    <span
      aria-hidden
      data-testid="muted-nudge"
      // `mb-4` rather than `mb-2`: the desktop card's padding is only 12px, so a tighter offset
      // parks the bubble on top of its rounded top-right corner.
      className="pointer-events-none absolute right-0 bottom-full mb-4 w-max rounded bg-text px-2 py-1 text-center text-breadcrumb whitespace-nowrap text-white shadow-lg"
    >
      You&rsquo;re muted
    </span>
  );
}

/**
 * The user's own control: mute toggle and audio settings, joined into one pill by a hairline.
 */
function LocalAudioControls({
  room,
  micFailure,
  onMicIntentChange,
  opponentAudible,
  nudgeSpentRef,
}: {
  room: Room;
  micFailure: MediaDeviceFailure | null;
  onMicIntentChange: (enabled: boolean) => void;
  opponentAudible: boolean;
  nudgeSpentRef: React.MutableRefObject<boolean>;
}) {
  const isMobile = useIsMobileCallLayout();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const settings = useVoiceAudioSettings(room, micFailure);

  const muted = !isMicrophoneEnabled || Boolean(micFailure);
  // A dead microphone has its own note under the dock, which says more than this could.
  const nudgeVisible = useMutedNudge(muted && !micFailure, opponentAudible, nudgeSpentRef);
  const settingsTrigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label="Audio settings"
      title="Audio settings"
      aria-expanded={open}
      onClick={isMobile ? () => setOpen(current => !current) : undefined}
      className="grid h-full shrink-0 place-items-center px-2 text-grey-04 transition-colors hover:text-text"
    >
      <span className={cx('grid place-items-center transition-transform', open && 'rotate-180')}>
        <ChevronDownSmall />
      </span>
    </button>
  );

  return (
    <span className="relative flex h-7 shrink-0 items-center rounded-full border border-grey-02 bg-white">
      {/* The spoken half of the nudge is a region that is always mounted and only changes text.
          A live region inserted with its content already in it is dropped by VoiceOver often
          enough to be unreliable, and this is the only announcement a screen-reader user gets
          that the default muted them. The bubble itself is `aria-hidden` so it is not read twice. */}
      <span role="status" data-testid="muted-nudge-announcement" className="sr-only">
        {nudgeVisible ? 'You’re muted' : ''}
      </span>
      {nudgeVisible && <MutedNudge />}
      <button
        type="button"
        // Both derived from `muted`, like the glyph and the disabled state. Deriving the label
        // from `isMicrophoneEnabled` instead lets a failed microphone announce "Mute microphone"
        // while showing a slashed icon on a button that cannot be pressed.
        aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        title={micFailure ? micFailureMessage(micFailure) : muted ? 'Unmute microphone' : 'Mute microphone'}
        onClick={() => {
          const next = !isMicrophoneEnabled;
          // Whichever way this click goes, the user has just found the control — so the nudge
          // that exists to point at it has nothing left to say. Spending it here also covers two
          // states it would otherwise misread: muting on purpose looks exactly like the join
          // default, and unmuting leaves `isMicrophoneEnabled` false for as long as the
          // permission dialog is open, both of which would pop the bubble at someone who is
          // already dealing with the microphone.
          nudgeSpentRef.current = true;
          // Record the intent before publishing it, so a reconnect restores this choice rather
          // than the join-time default.
          onMicIntentChange(next);
          // Unmuting is the first thing to open the microphone, so this is where a denial lands.
          // LiveKit reports it through `onMediaDeviceFailure`; catching only keeps the rejection
          // from surfacing as an unhandled promise.
          void localParticipant.setMicrophoneEnabled(next).catch(() => undefined);
        }}
        disabled={Boolean(micFailure)}
        // Muted is now the state the user lands in without choosing it, so it cannot be a slash
        // through an otherwise unchanged icon. Red on the same tertiary wash the opponent's chip
        // uses says it in one glance.
        //
        // A dead microphone keeps a separate look — red, but unfilled and dimmed. Filling it the
        // same way would make a mute the user chose indistinguishable from one the browser
        // imposed, and only one of those is fixed by clicking the button.
        className={cx(
          'grid h-full shrink-0 place-items-center rounded-l-full px-2 transition [&>svg]:size-3',
          micFailure
            ? 'text-red-01 opacity-60'
            : muted
              ? 'bg-errorTertiary text-red-01 hover:opacity-80'
              : 'text-text hover:text-grey-04',
          'disabled:cursor-default'
        )}
      >
        <MicrophoneIcon muted={muted} />
      </button>
      <span aria-hidden className="h-[13px] w-px shrink-0 rounded-xs bg-grey-02" />
      {isMobile ? (
        <>
          {settingsTrigger}
          <MobileSettingsSheet
            title="Audio settings"
            open={open}
            onOpenChange={setOpen}
            returnFocusRef={triggerRef}
          >
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
  // Radix's default portal wrapper is globally capped at z-60, below this dock's z-[160].
  const elevatedPopoverPortal = useElevatedPopoverPortal();

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      {elevatedPopoverPortal && (
        <Popover.Portal container={elevatedPopoverPortal}>
          <Popover.Content
            role="dialog"
            aria-label="Audio settings"
            side="top"
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
 * which enumerates nothing without an open preview — one this dock deliberately never starts. Real
 * device labels need microphone permission: usually already granted, since the pair arrives from a
 * debate, and otherwise granted by the up-front prime. What can still leave the list on its
 * "Microphone 1" fallbacks is timing, not the mute default — this enumerates once at mount and
 * then only on `devicechange`, and the room reaches Connected well before a user answers the
 * prompt. Asking again here is worse than the fallback labels: see the note on
 * `requestPermissions` below. Each choice is written back to
 * that session, which is what the debate room's pre-join screen reads, so whatever the pair settled
 * on while browsing claims is still selected when they walk into the debate. Writing the microphone
 * back cannot grab it a second time: `ensurePreview` bails unless a preview session is open.
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
