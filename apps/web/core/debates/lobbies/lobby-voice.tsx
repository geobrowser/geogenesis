'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useParticipants,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import type { TrackReference } from '@livekit/components-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import {
  ConnectionState,
  DisconnectReason,
  type LocalTrackPublication,
  MediaDeviceFailure,
  ParticipantEvent,
  type Room,
  RoomEvent,
  type RoomOptions,
  Track,
  type TrackPublication,
  VideoPresets,
} from 'livekit-client';

import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';
import { withMediaDeviceOptions } from '~/core/media/device-options';
import { useInitialMediaDevices } from '~/core/media/use-initial-media-devices';

import { Text } from '~/design-system/text';

import { type DebateLobbyVoiceToken, dashlessId, getDebateLobbyVoiceToken } from '../api';
import { cameraFailureMessage } from '../camera-failure';
import { CameraIcon, MicrophoneIcon } from '../debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '../debate-room-ownership';
import { useGeoChatAuth } from '../hooks';
import { tokenAllowsCamera } from '../livekit-grant';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { createLobbyCamera } from './lobby-camera';
import { lobbyErrorMessage } from './lobby-format';
import { LobbySlot } from './lobby-slots';
import type { MemberLobbyPageView } from './lobby-view';
import { registerLobbyCapture, reportLobbyCamera, reportLobbyMic } from './step-out';

type OwnershipState = 'pending' | 'owned' | 'elsewhere';

/** Who is speaking, whose mic is on and whose camera is showing, by dashless user id (the LiveKit identity). */
export type LobbyVoiceStates = {
  speaking: ReadonlySet<string>;
  micOn: ReadonlySet<string>;
  cameras: ReadonlyMap<string, TrackReference>;
  connected: boolean;
};

const NO_VOICE: LobbyVoiceStates = { speaking: new Set(), micOn: new Set(), cameras: new Map(), connected: false };
const LobbyVoiceContext = React.createContext<LobbyVoiceStates>(NO_VOICE);

/** Voice state for the roster; empty outside a connected room. */
export function useLobbyVoiceStates() {
  return React.useContext(LobbyVoiceContext);
}

/** Outside the `debates` root, so a gateway reconcile never mints a new token mid-call. */
const voiceTokenKey = (accountKey: string | null, lobbyId: string, canPublish: boolean) =>
  ['lobby-voice', accountKey, dashlessId(lobbyId), canPublish] as const;

/** Hosts, the acting host and speakers publish; a change needs a new token. */
function rolePublishes(lobby: MemberLobbyPageView) {
  return lobby.viewer.hosting || lobby.viewer.role === 'host' || lobby.viewer.role === 'speaker';
}

const ROOM_OPTIONS: RoomOptions = {
  // LiveKit's default reconnect gives up after ~37s; this rides out deploys and brief drops.
  reconnectPolicy: new ExtendedReconnectPolicy(),
  // Up to 40 people and many cameras: only tiles on screen receive video, sized to the tile, and
  // publishers stop encoding layers nobody watches.
  adaptiveStream: true,
  dynacast: true,
  videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
  publishDefaults: {
    // Pinned as in the debate room: the audio armor slow connections rely on.
    red: true,
    dtx: true,
    simulcast: true,
    videoSimulcastLayers: [VideoPresets.h180],
    videoEncoding: { maxBitrate: 300_000, maxFramerate: 20 },
  },
};

/**
 * Lobby voice (GEO-3129): one LiveKit room per lobby, joined from one tab per person. Mounted only
 * while this tab is in the lobby, so stepping out or leaving disconnects it.
 */
export function LobbyVoice({
  lobby,
  connectionId,
  joined,
  currentUserId,
  onConnectedChange,
  onAudible,
  onUnavailable,
  children,
}: {
  lobby: MemberLobbyPageView;
  connectionId: string;
  /** This tab's own join has landed. */
  joined: boolean;
  currentUserId: string | null;
  onConnectedChange: (connected: boolean) => void;
  /** Connected with playback allowed: a guest room still playing can go. */
  onAudible?: () => void;
  /** Voice is refused, failed or in another tab: a guest room still playing goes too. */
  onUnavailable?: () => void;
  children: React.ReactNode;
}) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
  const devices = useInitialMediaDevices();
  const roomOptions = React.useMemo(() => withMediaDeviceOptions(devices, ROOM_OPTIONS), [devices]);
  const lobbyId = lobby.lobby_id;
  const canPublish = rolePublishes(lobby);

  // One LiveKit identity per person: a second tab would replace this one, so tabs take turns.
  const [ownership, setOwnership] = React.useState<OwnershipState>('pending');
  const roomRef = React.useRef<Room | null>(null);
  const coordinatorRef = React.useRef<ReturnType<typeof createDebateRoomOwnershipCoordinator> | null>(null);

  React.useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    const coordinator = createDebateRoomOwnershipCoordinator({
      debateId: `lobby:${dashlessId(lobbyId)}`,
      userId: currentUserId,
      onTakeoverRequested: async () => {
        // Yield only when not on screen, and disconnect before answering.
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
        try {
          await roomRef.current?.disconnect();
        } catch {
          // Released when the page goes away anyway.
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
      if (result.acquired) return setOwnership('owned');
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const released = await coordinator.requestTakeover();
        if (!cancelled) setOwnership(released ? 'owned' : 'elsewhere');
      } else {
        setOwnership('elsewhere');
      }
    })();
    return () => {
      cancelled = true;
      coordinatorRef.current = null;
      setOwnership('pending');
      void coordinator.release();
      coordinator.close();
    };
  }, [currentUserId, lobbyId]);

  // Minted right before connecting, once this connection holds a lease; LiveKit refreshes it while
  // connected. Disabled during a lapse's rejoin, which keeps the token and the live room.
  const token = useQuery({
    queryKey: voiceTokenKey(accountKey, lobbyId, canPublish),
    queryFn: () =>
      getDebateLobbyVoiceToken(lobbyId, { connection_id: connectionId }, getPrivyIdentityToken, accountKey),
    enabled: authenticated && ownership === 'owned' && joined,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // `<LiveKitRoom audio>` replays on every connect, so it follows what the viewer chose.
  const [micChoice, setMicChoice] = React.useState<boolean | null>(null);
  const [micFailure, setMicFailure] = React.useState<MediaDeviceFailure | null>(null);
  const [epoch, setEpoch] = React.useState(0);
  const [connectFailed, setConnectFailed] = React.useState(false);
  const connectedRef = React.useRef(false);
  // A full reconnect needs a fresh token; `reset` clears the old one so the room cannot remount on it.
  const retry = React.useCallback(() => {
    void queryClient.resetQueries({ queryKey: voiceTokenKey(accountKey, lobbyId, canPublish) });
    connectedRef.current = false;
    setConnectFailed(false);
    setMicFailure(null);
    setCameraFailure(null);
    setEpoch(value => value + 1);
  }, [accountKey, canPublish, lobbyId, queryClient]);

  const takeOver = React.useCallback(async () => {
    const coordinator = coordinatorRef.current;
    if (!coordinator || !(await coordinator.requestTakeover())) return;
    setOwnership('owned');
    retry();
  }, [retry]);

  const data = token.data;
  const micIntent = Boolean(data?.can_publish) && (micChoice ?? !data?.start_muted);
  // A listen-only token records the mic as off, so a later move to speakers or host starts muted.
  const listenOnly = data !== undefined && !data.can_publish;
  React.useEffect(() => {
    if (listenOnly) setMicChoice(false);
  }, [listenOnly]);

  // Off with a mic-only token (lobby video off on the server, GEO-3161) or a listen-only one.
  const cameraAllowed = Boolean(data?.can_publish) && tokenAllowsCamera(data?.token ?? '');
  // Off on join and on every promotion until the speaker turns it on.
  const [cameraIntent, setCameraIntent] = React.useState(false);
  const [cameraFailure, setCameraFailure] = React.useState<MediaDeviceFailure | null>(null);
  // Also covers taking voice back from another tab: its retry clears the token first.
  React.useEffect(() => {
    if (!cameraAllowed) setCameraIntent(false);
  }, [cameraAllowed]);
  const handleCameraChoice = React.useCallback((enabled: boolean) => {
    setCameraIntent(enabled);
    if (enabled) setCameraFailure(null);
  }, []);
  const handleCameraFailure = React.useCallback((failure: MediaDeviceFailure | null) => {
    setCameraIntent(false);
    setCameraFailure(failure ?? MediaDeviceFailure.Other);
  }, []);

  // What stepping out to debate carries to the picker or ready room. Only devices of the viewer's own
  // here count: a listener, or voice held by another tab, leaves the next screen at its default.
  // Not cleared on unmount: a step-out from the server unmounts this before the route runs.
  const lobbyMic = ownership === 'owned' && data?.can_publish ? micIntent && !micFailure : null;
  React.useEffect(() => reportLobbyMic(lobbyMic), [lobbyMic]);
  const lobbyCamera = ownership === 'owned' && cameraAllowed ? cameraIntent : null;
  React.useEffect(() => reportLobbyCamera(lobbyCamera), [lobbyCamera]);

  const handleConnected = React.useCallback(() => {
    connectedRef.current = true;
    setConnectFailed(false);
  }, []);
  // Shown as voice in another tab, with "Use voice here"; it does not reconnect by itself.
  const handleReplaced = React.useCallback(() => setOwnership('elsewhere'), []);
  // A join dropped before it ever connected gets one fresh token by itself, then the notice.
  const autoRetriedRef = React.useRef(false);
  const handleNeverConnected = React.useCallback(() => {
    if (autoRetriedRef.current) return setConnectFailed(true);
    autoRetriedRef.current = true;
    retry();
  }, [retry]);
  // `<LiveKitRoom>` publishes the mic on SignalConnected, before Connected, and sends a refusal here
  // too. A blocked or missing mic leaves the room up for listening; only a connection failure doesn't.
  const handleError = React.useCallback((error: Error) => {
    const micProblem = micFailureOf(error);
    if (micProblem) return setMicFailure(micProblem);
    if (!connectedRef.current) setConnectFailed(true);
  }, []);
  // A camera failure reported here must not read as a mic problem.
  const handleMediaDeviceFailure = React.useCallback(
    (failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
      if (kind === 'videoinput') return handleCameraFailure(failure ?? null);
      setMicFailure(failure ?? null);
    },
    [handleCameraFailure]
  );
  // Unmuting tries the mic again, so a permission granted since can take effect.
  const handleMicChoice = React.useCallback((enabled: boolean) => {
    setMicChoice(enabled);
    if (enabled) setMicFailure(null);
  }, []);

  // Not connected unless the room below says so.
  React.useEffect(() => () => onConnectedChange(false), [onConnectedChange]);

  const notice = ((): VoiceNotice | null => {
    if (!currentUserId || ownership === 'pending') return { message: 'Connecting voice…' };
    if (ownership === 'elsewhere') {
      return { message: 'Voice is on in another tab', actionLabel: 'Use voice here', onAction: () => void takeOver() };
    }
    if (token.error) {
      return {
        message: lobbyErrorMessage(token.error, 'Voice is unavailable right now.'),
        actionLabel: 'Try again',
        onAction: retry,
      };
    }
    if (!data) return { message: 'Connecting voice…' };
    if (connectFailed) return { message: 'Voice could not connect.', actionLabel: 'Try again', onAction: retry };
    return null;
  })();

  const unavailable = ownership === 'elsewhere' || Boolean(token.error) || connectFailed;
  React.useEffect(() => {
    if (unavailable) onUnavailable?.();
  }, [onUnavailable, unavailable]);

  if (notice || !data || !devices.ready) {
    return (
      <>
        <VoiceBar notice={notice ?? { message: 'Connecting voice…' }} />
        {children}
      </>
    );
  }

  return (
    <LiveKitRoom
      key={epoch}
      token={data.token}
      serverUrl={data.url}
      connect
      audio={micIntent && !micFailure}
      video={false}
      options={roomOptions}
      onConnected={handleConnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      className="contents"
    >
      <ConnectedVoice
        canPublish={data.can_publish}
        micFailure={micFailure}
        cameraAllowed={cameraAllowed}
        cameraIntent={cameraIntent}
        cameraFailure={cameraFailure}
        onCameraChoice={handleCameraChoice}
        onCameraFailure={handleCameraFailure}
        roomRef={roomRef}
        onMicChoice={handleMicChoice}
        onRetry={retry}
        onConnectedChange={onConnectedChange}
        onAudible={onAudible}
        onNeverConnected={handleNeverConnected}
        onReplaced={handleReplaced}
      >
        {children}
      </ConnectedVoice>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

/** A mic that could not be opened, as opposed to a connection that failed. */
function micFailureOf(error: Error): MediaDeviceFailure | null {
  if (error.name === 'OverconstrainedError') return MediaDeviceFailure.NotFound;
  const failure = MediaDeviceFailure.getFailure(error);
  // `getFailure` answers `Other` for any named error, connection errors included.
  return failure && failure !== MediaDeviceFailure.Other ? failure : null;
}

type VoiceNotice = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Shown beside a mic control too, e.g. a mic that could not be opened. */
  visible?: boolean;
};

function ConnectedVoice({
  canPublish,
  micFailure,
  cameraAllowed,
  cameraIntent,
  cameraFailure,
  onCameraChoice,
  onCameraFailure,
  roomRef,
  onMicChoice,
  onRetry,
  onConnectedChange,
  onAudible,
  onNeverConnected,
  onReplaced,
  children,
}: {
  canPublish: boolean;
  micFailure: MediaDeviceFailure | null;
  cameraAllowed: boolean;
  cameraIntent: boolean;
  cameraFailure: MediaDeviceFailure | null;
  onCameraChoice: (enabled: boolean) => void;
  onCameraFailure: (failure: MediaDeviceFailure | null) => void;
  roomRef: React.MutableRefObject<Room | null>;
  onMicChoice: (enabled: boolean) => void;
  onRetry: () => void;
  onConnectedChange: (connected: boolean) => void;
  onAudible?: () => void;
  onNeverConnected: () => void;
  onReplaced: () => void;
  children: React.ReactNode;
}) {
  const room = useRoomContext();
  useRoomEnding(room, {
    onNeverConnected,
    // Another tab or device took this identity; reconnecting would only take it back and forth.
    onRemoved: reason => {
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) onReplaced();
    },
  });
  React.useEffect(() => {
    roomRef.current = room;
    return () => {
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [room, roomRef]);

  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;
  React.useEffect(() => onConnectedChange(connected), [connected, onConnectedChange]);

  // Disconnected reads the same before the first connect and after giving up; only the latter retries.
  const [everConnected, setEverConnected] = React.useState(false);
  React.useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);

  // Autoplay can be blocked with no click before connecting (iOS); playback needs a user gesture.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  const { localParticipant, isMicrophoneEnabled, microphoneTrack } = useLocalParticipant();

  // A request card over the lobby releases this before opening its own mic. Held through a reconnect,
  // which republishes the same track.
  const capturedMic = (microphoneTrack as LocalTrackPublication | undefined)?.track;
  React.useEffect(() => {
    if (!capturedMic) return;
    return registerLobbyCapture('audio', {
      on: isMicrophoneEnabled,
      release: () => {
        onMicChoice(false);
        void localParticipant.unpublishTrack(capturedMic, true).catch(() => undefined);
      },
    });
  }, [capturedMic, isMicrophoneEnabled, localParticipant, onMicChoice]);
  const audible = connected && canPlayAudio;
  React.useEffect(() => {
    if (audible) onAudible?.();
  }, [audible, onAudible]);

  // A host's move to listeners revokes publishing in LiveKit at once, before the lobby refetch
  // brings the new role and a listen-only token; the mic goes down now.
  const permissions = useLocalParticipantPermissions();
  const mayPublish = canPublish && permissions?.canPublish !== false;
  const camera = React.useMemo(() => createLobbyCamera(localParticipant), [localParticipant]);
  React.useEffect(() => {
    if (!canPublish || mayPublish) return;
    onMicChoice(false);
    void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    onCameraChoice(false);
    camera.release();
  }, [camera, canPublish, localParticipant, mayPublish, onCameraChoice, onMicChoice]);

  // `<LiveKitRoom video>` only applies on connect, so the camera follows the choice from here. Off
  // (toggled, demoted, flag off) or disconnected releases it; reconnecting keeps it.
  const cameraOn = cameraAllowed && mayPublish && cameraIntent;
  React.useEffect(() => {
    if (connected && cameraOn) {
      camera.enable().catch((error: unknown) => {
        onCameraFailure(error instanceof Error ? (MediaDeviceFailure.getFailure(error) ?? null) : null);
      });
    } else if (!cameraOn || connectionState === ConnectionState.Disconnected) {
      camera.release();
    }
  }, [camera, cameraOn, connected, connectionState, onCameraFailure]);

  // Stepping out into a debate, or a request card opening its own camera, stops this one first.
  // Registered the moment an acquisition starts, not once it publishes.
  React.useEffect(() => {
    let unregister: (() => void) | null = null;
    const sync = () => {
      if (camera.held() === (unregister !== null)) return;
      if (unregister) {
        unregister();
        unregister = null;
        return;
      }
      unregister = registerLobbyCapture('video', {
        on: true,
        release: () => {
          onCameraChoice(false);
          camera.release();
        },
      });
    };
    const unsubscribe = camera.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      unregister?.();
    };
  }, [camera, onCameraChoice]);
  // A server step-out unmounts this before the route runs, and the room's disconnect only stops the
  // camera after awaiting the network; iPhone needs the device free by the time the next screen asks.
  React.useEffect(() => () => camera.release(), [camera]);

  // A host's mute arrives as a muted track; remembering it keeps a reconnect from unmuting.
  React.useEffect(() => {
    const onMuted = (publication: TrackPublication) => {
      if (publication.source === Track.Source.Microphone) onMicChoice(false);
    };
    localParticipant.on(ParticipantEvent.TrackMuted, onMuted);
    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, onMuted);
    };
  }, [localParticipant, onMicChoice]);

  const states = useParticipantVoiceStates(connected);

  const setMicrophone = (enabled: boolean) => {
    onMicChoice(enabled);
    // A denial reaches `onMediaDeviceFailure`.
    void localParticipant.setMicrophoneEnabled(enabled).catch(() => undefined);
  };

  const notice = ((): VoiceNotice | null => {
    if (connectionState === ConnectionState.Disconnected && everConnected) {
      return { message: 'Voice disconnected', actionLabel: 'Try again', onAction: onRetry };
    }
    if (connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting) {
      return { message: 'Reconnecting…' };
    }
    if (!connected) return { message: 'Connecting voice…' };
    if (!canPlayAudio)
      return { message: 'Tap to hear the room', actionLabel: 'Join audio', onAction: () => void startAudio() };
    return null;
  })();

  return (
    <LobbyVoiceContext.Provider value={states}>
      {notice ? (
        <VoiceBar notice={notice} />
      ) : mayPublish ? (
        <VoiceBar
          notice={{
            message: micFailure
              ? 'Your microphone isn’t available.'
              : cameraFailure
                ? cameraFailureMessage(cameraFailure)
                : isMicrophoneEnabled
                  ? 'You’re on the mic'
                  : 'You’re muted',
            visible: Boolean(micFailure || cameraFailure),
          }}
          mic={{ on: isMicrophoneEnabled && !micFailure, onToggle: setMicrophone }}
          camera={cameraAllowed ? { on: cameraOn, onToggle: onCameraChoice } : undefined}
        />
      ) : (
        <VoiceBar notice={{ message: 'You’re listening' }} listening />
      )}
      {children}
    </LobbyVoiceContext.Provider>
  );
}

/** Disconnects that mean this identity was taken out or taken over: never a reason to reconnect by itself. */
const REMOVED_REASONS: ReadonlySet<DisconnectReason> = new Set([
  DisconnectReason.PARTICIPANT_REMOVED,
  DisconnectReason.DUPLICATE_IDENTITY,
]);

/**
 * `onRemoved` when the server removed this identity or another tab or device joined with it;
 * else `onNeverConnected` for a drop before connecting. LiveKit sends the reason after the state.
 */
function useRoomEnding(
  room: Room,
  handlers: { onNeverConnected: () => void; onRemoved?: (reason: DisconnectReason) => void }
) {
  const handlersRef = React.useRef(handlers);
  React.useEffect(() => {
    handlersRef.current = handlers;
  });
  React.useEffect(() => {
    let attempted = room.state !== ConnectionState.Disconnected;
    let connected = room.state === ConnectionState.Connected;
    let removed = false;
    const onState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) connected = true;
      else if (state !== ConnectionState.Disconnected) attempted = true;
      else if (attempted && !connected) {
        queueMicrotask(() => {
          if (!removed) handlersRef.current.onNeverConnected();
        });
      }
    };
    const onDisconnected = (reason?: DisconnectReason) => {
      if (reason === undefined || !REMOVED_REASONS.has(reason)) return;
      removed = true;
      handlersRef.current.onRemoved?.(reason);
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room]);
}

const CAMERA_SOURCES = [Track.Source.Camera];
// Besides publish, unpublish and subscription changes; not active speakers, which change constantly.
const CAMERA_UPDATES = { updateOnlyOn: [RoomEvent.TrackMuted, RoomEvent.TrackUnmuted] };

/** Who is speaking, whose mic is on and whose camera shows in the room this sits in. */
function useParticipantVoiceStates(connected: boolean) {
  const participants = useParticipants();
  const cameraTracks = useTracks(CAMERA_SOURCES, CAMERA_UPDATES);
  return React.useMemo<LobbyVoiceStates>(() => {
    const speaking = new Set<string>();
    const micOn = new Set<string>();
    for (const participant of participants) {
      const id = dashlessId(participant.identity).toLowerCase();
      if (!participant.isMicrophoneEnabled) continue;
      micOn.add(id);
      if (participant.isSpeaking) speaking.add(id);
    }
    const cameras = new Map<string, TrackReference>();
    for (const reference of cameraTracks) {
      if (!reference.publication.track || reference.publication.isMuted) continue;
      cameras.set(dashlessId(reference.participant.identity).toLowerCase(), reference);
    }
    return { speaking, micOn, cameras, connected };
  }, [cameraTracks, connected, participants]);
}

/** Holds the roster's voice state; a member room inside overrides it with its own. */
export const LobbyVoiceStatesProvider = LobbyVoiceContext.Provider;
export { NO_VOICE as NO_LOBBY_VOICE };

export const LOBBY_GUEST_VOICE_COPY = {
  listenOnly: 'Listening only. Your mic is off until you have an account.',
  connecting: 'Connecting voice…',
  tapToHear: 'Tap to hear the room',
  joinAudio: 'Join audio',
  disconnected: 'Voice disconnected',
} as const;

/**
 * A visitor's listen-only room (GEO-3129). A sibling of the member room, so the handover can drop
 * it while the member room plays; speaking state goes up through `onStates`.
 */
export function LobbyGuestVoice({
  token,
  onStates,
  onReconnect,
  onAutoReconnect,
  onRemoved,
  quiet = false,
}: {
  token: DebateLobbyVoiceToken;
  onStates: (states: LobbyVoiceStates) => void;
  /** A full reconnect needs a fresh token on the same guest. */
  onReconnect: () => void;
  /**
   * After a join dropped before connecting: reconnects if the page has an automatic retry left,
   * and says whether it did. Kept by the page, since a fresh token remounts this room.
   */
  onAutoReconnect: () => boolean;
  /** Another tab took this room's identity, or the server removed it; the page checks the session for why. */
  onRemoved: () => void;
  /** The member room is taking over and draws its own bar. */
  quiet?: boolean;
}) {
  const [connectFailed, setConnectFailed] = React.useState(false);
  const connectedRef = React.useRef(false);
  const handleConnected = React.useCallback(() => {
    connectedRef.current = true;
    setConnectFailed(false);
  }, []);
  const handleError = React.useCallback(() => {
    if (!connectedRef.current) setConnectFailed(true);
  }, []);
  const handleNeverConnected = React.useCallback(() => {
    if (!onAutoReconnect()) setConnectFailed(true);
  }, [onAutoReconnect]);
  React.useEffect(() => () => onStates(NO_VOICE), [onStates]);

  if (connectFailed) {
    return quiet ? null : (
      <VoiceBar notice={{ message: 'Voice could not connect.', actionLabel: 'Try again', onAction: onReconnect }} />
    );
  }

  return (
    <LiveKitRoom
      token={token.token}
      serverUrl={token.url}
      connect
      audio={false}
      video={false}
      options={ROOM_OPTIONS}
      onConnected={handleConnected}
      onError={handleError}
      className="contents"
    >
      <ConnectedGuestVoice
        onStates={onStates}
        onReconnect={onReconnect}
        onNeverConnected={handleNeverConnected}
        onRemoved={onRemoved}
        quiet={quiet}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function ConnectedGuestVoice({
  onStates,
  onReconnect,
  onNeverConnected,
  onRemoved,
  quiet,
}: {
  onStates: (states: LobbyVoiceStates) => void;
  onReconnect: () => void;
  onNeverConnected: () => void;
  onRemoved: () => void;
  quiet: boolean;
}) {
  const room = useRoomContext();
  // Removed by the server: no Try again, which would take the session back; the page asks why.
  const [removed, setRemoved] = React.useState(false);
  useRoomEnding(room, {
    onNeverConnected,
    onRemoved: () => {
      setRemoved(true);
      onRemoved();
    },
  });
  const connectionState = useConnectionState();
  const connected = connectionState === ConnectionState.Connected;
  const [everConnected, setEverConnected] = React.useState(false);
  React.useEffect(() => {
    if (connected) setEverConnected(true);
  }, [connected]);
  // iOS blocks playback until a tap; "Join audio" is that tap.
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  const states = useParticipantVoiceStates(connected);
  React.useEffect(() => onStates(states), [onStates, states]);
  React.useEffect(() => () => onStates(NO_VOICE), [onStates]);

  if (quiet) return null;
  const notice: VoiceNotice = removed
    ? { message: LOBBY_GUEST_VOICE_COPY.disconnected }
    : connectionState === ConnectionState.Disconnected && everConnected
      ? { message: LOBBY_GUEST_VOICE_COPY.disconnected, actionLabel: 'Try again', onAction: onReconnect }
      : connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting
        ? { message: 'Reconnecting…' }
        : !connected
          ? { message: LOBBY_GUEST_VOICE_COPY.connecting }
          : !canPlayAudio
            ? {
                message: LOBBY_GUEST_VOICE_COPY.tapToHear,
                actionLabel: LOBBY_GUEST_VOICE_COPY.joinAudio,
                onAction: () => void startAudio(),
              }
            : { message: LOBBY_GUEST_VOICE_COPY.listenOnly };
  return <VoiceBar notice={notice} />;
}

/**
 * Mute or the listening pill, plus voice status, in the lobby's bottom bar. The status is sr-only
 * beside a mic control, and on a phone unless it needs a tap.
 */
function VoiceBar({
  notice,
  mic,
  camera,
  listening = false,
}: {
  notice: VoiceNotice;
  mic?: { on: boolean; onToggle: (enabled: boolean) => void };
  /** Only when the token allows a camera; listeners and a lobby with video off get none. */
  camera?: { on: boolean; onToggle: (enabled: boolean) => void };
  /** Connected without a mic: a disabled "Listening" pill stands in for Mute. */
  listening?: boolean;
}) {
  const action = notice.actionLabel && notice.onAction ? notice : null;
  return (
    <LobbySlot name="controls">
      <div className="flex min-w-0 items-center gap-2" data-testid="lobby-voice-bar">
        {mic ? (
          <HubPillButton
            variant={mic.on ? 'secondary' : 'primary'}
            analyticsLabel={mic.on ? 'Lobby mute' : 'Lobby unmute'}
            aria-pressed={!mic.on}
            onClick={() => mic.onToggle(!mic.on)}
            className="md:h-10"
          >
            <span className="inline-flex items-center gap-1.5">
              <MicrophoneIcon muted={!mic.on} />
              {mic.on ? 'Mute' : 'Unmute'}
            </span>
          </HubPillButton>
        ) : null}
        {mic && camera ? (
          <HubPillButton
            variant={camera.on ? 'secondary' : 'primary'}
            analyticsLabel={camera.on ? 'Lobby camera off' : 'Lobby camera on'}
            aria-label={camera.on ? 'Turn camera off' : 'Turn camera on'}
            onClick={() => camera.onToggle(!camera.on)}
            className="md:h-10"
          >
            <span className="inline-flex items-center gap-1.5">
              <CameraIcon disabled={!camera.on} />
              <span className="md:sr-only">{camera.on ? 'Camera off' : 'Camera on'}</span>
            </span>
          </HubPillButton>
        ) : null}
        {mic ? null : listening ? (
          <span
            aria-hidden
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-grey-01 px-3 text-metadata text-grey-03 md:h-10"
          >
            <MicrophoneIcon muted />
            Listening
          </span>
        ) : null}
        <div
          role="status"
          className={cx('min-w-0', (mic || listening) && !notice.visible ? 'sr-only' : action ? '' : 'md:sr-only')}
        >
          <Text as="p" variant="footnote" color={notice.visible ? 'text' : 'grey-04'} className="truncate">
            {notice.message}
          </Text>
        </div>
        {action ? (
          <HubPillButton
            analyticsLabel={`Lobby voice ${action.actionLabel}`}
            onClick={action.onAction}
            className="md:h-10"
          >
            {action.actionLabel}
          </HubPillButton>
        ) : null}
      </div>
    </LobbySlot>
  );
}
