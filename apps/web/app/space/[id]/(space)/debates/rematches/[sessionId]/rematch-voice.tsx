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
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { ConnectionState, type MediaDeviceFailure, type Room, Track } from 'livekit-client';

import type { DebateRematchParticipant, DebateRematchSession } from '~/core/debates/api';
import { GeoChatRequestError } from '~/core/debates/api';
import { MicrophoneIcon, RecordingCircleButton, SpeakerIcon } from '~/core/debates/debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '~/core/debates/debate-room-ownership';
import { DeviceOptionGroup } from '~/core/debates/device-option-group';
import { debateQueryKeys, useGeoChatAuth, useRematchLiveKitJoin } from '~/core/debates/hooks';
import { useDebateMediaSession } from '~/core/debates/media-session';
import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { Avatar } from '~/design-system/avatar';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Menu } from '~/design-system/menu';

import type { RemoteParticipant } from 'livekit-client';

// Voice auto-joins with the mic live: both users came here to coordinate out loud, and in the
// debate-again flow they arrive straight from a debate where their mics were already hot.
const JOIN_UNMUTED = true;

type OwnershipState = 'pending' | 'owned' | 'elsewhere';

function voiceCapable(status: DebateRematchSession['status']) {
  return status === 'browsing' || status === 'request_pending';
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

  // Only one tab per user may hold the mic. Same coordinator as the debate room, namespaced so a
  // rematch session can never collide with a debate id.
  const [ownership, setOwnership] = React.useState<OwnershipState>('pending');
  const roomRef = React.useRef<Room | null>(null);
  const coordinatorRef = React.useRef<ReturnType<typeof createDebateRoomOwnershipCoordinator> | null>(null);

  React.useEffect(() => {
    if (!voiceActive) return;
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

  const takeOver = React.useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator) return;
    const released = await coordinator.requestTakeover();
    if (released) setOwnership('owned');
  }, []);

  const join = useRematchLiveKitJoin(session.id, voiceActive && ownership === 'owned');

  // Recovery from a dead connection: mint a fresh token and remount the room. Handing a mounted
  // `<LiveKitRoom>` a new token would tear it down mid-flight, so the epoch key remounts instead.
  const [connectionEpoch, setConnectionEpoch] = React.useState(0);
  const queryClient = useQueryClient();
  const { accountKey } = useGeoChatAuth();
  const retry = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: debateQueryKeys.rematchLiveKit(accountKey, session.id) });
    setConnectionEpoch(epoch => epoch + 1);
  }, [accountKey, queryClient, session.id]);

  const [micFailure, setMicFailure] = React.useState<MediaDeviceFailure | null>(null);

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

  if (!voiceActive || !opponent) return null;

  if (ownership === 'elsewhere') {
    return (
      <VoicePillFrame>
        <span className="text-metadata text-grey-04">Voice is active in another tab</span>
        <button
          type="button"
          onClick={() => void takeOver()}
          className="rounded-full bg-text px-3 py-1.5 text-metadataMedium text-white transition-opacity hover:opacity-80"
        >
          Use voice here
        </button>
      </VoicePillFrame>
    );
  }

  if (ownership === 'pending' || join.isLoading) return null;

  if (join.error) {
    // No backend support: LiveKit unconfigured (503) or the endpoint not deployed yet (404). The
    // picker works exactly as before voice existed. A blocked state (400/403) likewise has no
    // user-facing remedy here.
    if (
      join.error instanceof GeoChatRequestError &&
      [400, 403, 404].includes(join.error.status)
    ) {
      return null;
    }
    if (join.error instanceof GeoChatRequestError && join.error.code === 'livekit_not_configured') {
      return null;
    }
    return (
      <VoicePillFrame>
        <span className="text-metadata text-grey-04">Voice is unavailable</span>
        <button
          type="button"
          onClick={retry}
          className="rounded-full bg-text px-3 py-1.5 text-metadataMedium text-white transition-opacity hover:opacity-80"
        >
          Retry
        </button>
      </VoicePillFrame>
    );
  }

  if (!join.data) return null;

  return (
    <LiveKitRoom
      key={connectionEpoch}
      token={join.data.token}
      serverUrl={join.data.url}
      connect
      audio={JOIN_UNMUTED && !micFailure}
      video={false}
      options={roomOptions}
      onMediaDeviceFailure={failure => setMicFailure(failure ?? null)}
      className="contents"
    >
      <VoicePillBody opponent={opponent} micFailure={micFailure} onRetry={retry} roomRef={roomRef} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function VoicePillFrame({ children }: { children: React.ReactNode }) {
  // Above the picker overlay (z-[150]) and below the entity side panel (z-200): an opened claim
  // may cover the pill, and the audio keeps playing underneath it.
  return (
    <div className="fixed bottom-5 left-1/2 z-[160] flex -translate-x-1/2 items-center gap-3 rounded-full border border-grey-02 bg-white py-1.5 pr-1.5 pl-4 shadow-card">
      {children}
    </div>
  );
}

function VoicePillBody({
  opponent,
  micFailure,
  onRetry,
  roomRef,
}: {
  opponent: DebateRematchParticipant;
  micFailure: MediaDeviceFailure | null;
  onRetry: () => void;
  roomRef: React.MutableRefObject<Room | null>;
}) {
  const room = useRoomContext();
  React.useEffect(() => {
    roomRef.current = room;
    return () => {
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [room, roomRef]);

  const { setNoiseFilterEnabled } = useKrispNoiseFilter();
  React.useEffect(() => {
    void setNoiseFilterEnabled(true);
  }, [setNoiseFilterEnabled]);

  // Auto-join means no click stands between arriving and connecting, so the browser's autoplay
  // policy can refuse to play the opponent's audio — silently, with the room otherwise healthy
  // (presence and mute state keep updating). The debate room never hits this because its pre-join
  // screen supplies the gesture. `startAudio()` has to run from a real user event, so the pill
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

  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  if (connectionState === ConnectionState.Disconnected && everConnected) {
    return (
      <VoicePillFrame>
        <span className="text-metadata text-grey-04">Voice disconnected</span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-text px-3 py-1.5 text-metadataMedium text-white transition-opacity hover:opacity-80"
        >
          Retry
        </button>
      </VoicePillFrame>
    );
  }

  const connecting = connectionState !== ConnectionState.Connected;
  const reconnecting =
    connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting;

  // Blocked playback outranks everything else the pill could say: the room is fine, the opponent
  // may well be talking, and the viewer simply cannot hear it until they click.
  if (!connecting && !canPlayAudio) {
    return (
      <VoicePillFrame>
        <button
          type="button"
          onClick={() => void startAudio()}
          className="flex items-center gap-2 rounded-full bg-text px-3 py-1.5 text-metadataMedium text-white transition-opacity hover:opacity-80"
        >
          <SpeakerIcon disabled={false} />
          Enable audio
        </button>
      </VoicePillFrame>
    );
  }

  return (
    <VoicePillFrame>
      {connecting ? (
        <span className="flex items-center gap-2 text-metadata text-grey-04">
          <span className="size-2 animate-pulse rounded-full bg-grey-03" aria-hidden />
          {reconnecting ? 'Reconnecting…' : 'Connecting voice…'}
        </span>
      ) : opponentParticipant ? (
        <span className="flex items-center gap-2">
          <OpponentStatus participant={opponentParticipant} opponent={opponent} />
          <span className="max-w-[10rem] truncate text-metadata text-text">{opponentName}</span>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="opacity-40">
            <Avatar avatarUrl={opponent.avatar_cid} value={opponent.profile_space_id} size={28} alt="" />
          </span>
          <span className="max-w-[12rem] truncate text-metadata text-grey-04">Waiting for {opponentName}</span>
        </span>
      )}
      <RecordingCircleButton
        ariaLabel={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
        title={
          micFailure
            ? 'Microphone unavailable — check browser permissions'
            : isMicrophoneEnabled
              ? 'Mute microphone'
              : 'Unmute microphone'
        }
        onClick={() => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)}
        disabled={Boolean(micFailure)}
        active={!isMicrophoneEnabled}
        className={cx('size-9 shadow-none', micFailure && 'text-orange')}
      >
        <MicrophoneIcon muted={!isMicrophoneEnabled || Boolean(micFailure)} />
      </RecordingCircleButton>
      <MicrophonePicker room={room} />
    </VoicePillFrame>
  );
}

/**
 * Picks the microphone for the voice channel, and for the debate that follows it.
 *
 * The device list and the live switch come from LiveKit, which already holds mic permission here
 * so the labels are real. The choice is then written back to the app-wide media session, which is
 * what the debate room's pre-join screen reads — so whatever the pair settled on while browsing
 * claims is still selected when they walk into the debate. That write cannot grab the microphone
 * a second time: `ensurePreview` bails unless a preview session is open, and the pill never opens
 * one.
 */
function MicrophonePicker({ room }: { room: Room }) {
  const [open, setOpen] = React.useState(false);
  const { changeAudioInput } = useDebateMediaSession();
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind: 'audioinput',
    room,
  });

  const select = React.useCallback(
    (deviceId: string) => {
      setOpen(false);
      void setActiveMediaDevice(deviceId);
      changeAudioInput(deviceId);
    },
    [changeAudioInput, setActiveMediaDevice]
  );

  if (devices.length === 0) return null;

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      className="max-w-[min(20rem,calc(100vw-2rem))] p-1"
      trigger={
        <button
          type="button"
          aria-label="Choose microphone"
          title="Choose microphone"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-grey-02 text-grey-04 transition-colors hover:text-text"
        >
          <ChevronDownSmall />
        </button>
      }
    >
      <DeviceOptionGroup
        label="Select a microphone"
        options={devices.map(device => ({
          deviceId: device.deviceId,
          groupId: device.groupId,
          kind: device.kind,
          label: device.label || 'Microphone',
        }))}
        selectedDeviceId={activeDeviceId}
        onChange={select}
      />
    </Menu>
  );
}

function OpponentStatus({
  participant,
  opponent,
}: {
  participant: RemoteParticipant;
  opponent: DebateRematchParticipant;
}) {
  const speaking = useIsSpeaking(participant);
  const muted = useIsMuted({ participant, source: Track.Source.Microphone });

  return (
    <span className="relative inline-flex shrink-0">
      <span className={cx('inline-flex rounded-full transition-shadow', speaking && 'ring-2 ring-green')}>
        <Avatar avatarUrl={opponent.avatar_cid} value={opponent.profile_space_id} size={28} alt="" />
      </span>
      {muted ? (
        <span
          aria-label={`${opponent.display_name || 'Opponent'} is muted`}
          className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border border-white bg-text text-white [&>svg]:size-3"
        >
          <MicrophoneIcon muted />
        </span>
      ) : null}
    </span>
  );
}
