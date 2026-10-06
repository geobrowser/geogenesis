'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from '@livekit/components-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { ConnectionState, MediaDeviceFailure, type Room, type RoomOptions } from 'livekit-client';

import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { Text } from '~/design-system/text';

import { type DebateLobbyView, dashlessId, getDebateLobbyVoiceToken } from '../api';
import { MicrophoneIcon } from '../debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '../debate-room-ownership';
import { useGeoChatAuth } from '../hooks';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { lobbyErrorMessage } from './lobby-format';

type OwnershipState = 'pending' | 'owned' | 'elsewhere';

/** Who is speaking and whose mic is on, by dashless user id (the LiveKit identity). */
export type LobbyVoiceStates = { speaking: ReadonlySet<string>; micOn: ReadonlySet<string>; connected: boolean };

const NO_VOICE: LobbyVoiceStates = { speaking: new Set(), micOn: new Set(), connected: false };
const LobbyVoiceContext = React.createContext<LobbyVoiceStates>(NO_VOICE);

/** Voice state for the roster; empty outside a connected room. */
export function useLobbyVoiceStates() {
  return React.useContext(LobbyVoiceContext);
}

/** Outside the `debates` root, so a gateway reconcile never mints a new token mid-call. */
const voiceTokenKey = (accountKey: string | null, lobbyId: string, canPublish: boolean) =>
  ['lobby-voice', accountKey, dashlessId(lobbyId), canPublish] as const;

/** Hosts, the acting host and speakers publish; a change needs a new token. */
function rolePublishes(lobby: DebateLobbyView) {
  return lobby.viewer.hosting || lobby.viewer.role === 'host' || lobby.viewer.role === 'speaker';
}

const ROOM_OPTIONS: RoomOptions = {
  // LiveKit's default reconnect gives up after ~37s; this rides out deploys and brief drops.
  reconnectPolicy: new ExtendedReconnectPolicy(),
  // Pinned as in the debate room: the audio armor slow connections rely on.
  publishDefaults: { red: true, dtx: true },
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
  children,
}: {
  lobby: DebateLobbyView;
  connectionId: string;
  /** This tab's own join has landed. `viewer.present` counts any of the viewer's connections. */
  joined: boolean;
  currentUserId: string | null;
  onConnectedChange: (connected: boolean) => void;
  children: React.ReactNode;
}) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const queryClient = useQueryClient();
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

  const handleConnected = React.useCallback(() => {
    connectedRef.current = true;
    setConnectFailed(false);
  }, []);
  const handleError = React.useCallback(() => {
    if (!connectedRef.current) setConnectFailed(true);
  }, []);
  const handleMediaDeviceFailure = React.useCallback((failure?: MediaDeviceFailure) => {
    setMicFailure(failure ?? null);
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

  if (notice || !data) {
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
      options={ROOM_OPTIONS}
      onConnected={handleConnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
      className="contents"
    >
      <ConnectedVoice
        canPublish={data.can_publish}
        micFailure={micFailure}
        roomRef={roomRef}
        onMicChoice={setMicChoice}
        onRetry={retry}
        onConnectedChange={onConnectedChange}
      >
        {children}
      </ConnectedVoice>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

type VoiceNotice = { message: string; actionLabel?: string; onAction?: () => void };

function ConnectedVoice({
  canPublish,
  micFailure,
  roomRef,
  onMicChoice,
  onRetry,
  onConnectedChange,
  children,
}: {
  canPublish: boolean;
  micFailure: MediaDeviceFailure | null;
  roomRef: React.MutableRefObject<Room | null>;
  onMicChoice: (enabled: boolean) => void;
  onRetry: () => void;
  onConnectedChange: (connected: boolean) => void;
  children: React.ReactNode;
}) {
  const room = useRoomContext();
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
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const participants = useParticipants();

  const states = React.useMemo<LobbyVoiceStates>(() => {
    const speaking = new Set<string>();
    const micOn = new Set<string>();
    for (const participant of participants) {
      const id = dashlessId(participant.identity).toLowerCase();
      if (!participant.isMicrophoneEnabled) continue;
      micOn.add(id);
      if (participant.isSpeaking) speaking.add(id);
    }
    return { speaking, micOn, connected };
  }, [connected, participants]);

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
      ) : canPublish ? (
        <VoiceBar
          notice={{
            message: micFailure
              ? 'Your microphone isn’t available.'
              : isMicrophoneEnabled
                ? 'You’re on the mic'
                : 'You’re muted',
          }}
          mic={{ on: isMicrophoneEnabled && !micFailure, disabled: Boolean(micFailure), onToggle: setMicrophone }}
        />
      ) : (
        <VoiceBar notice={{ message: 'You’re listening' }} />
      )}
      {children}
    </LobbyVoiceContext.Provider>
  );
}

function VoiceBar({
  notice,
  mic,
}: {
  notice: VoiceNotice;
  mic?: { on: boolean; disabled: boolean; onToggle: (enabled: boolean) => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-grey-02 bg-white px-3 py-2">
      {mic ? (
        <HubPillButton
          variant={mic.on ? 'secondary' : 'primary'}
          analyticsLabel={mic.on ? 'Lobby mute' : 'Lobby unmute'}
          aria-pressed={!mic.on}
          disabled={mic.disabled}
          onClick={() => mic.onToggle(!mic.on)}
        >
          <span className="inline-flex items-center gap-1.5">
            <MicrophoneIcon muted={!mic.on} />
            {mic.on ? 'Mute' : 'Unmute'}
          </span>
        </HubPillButton>
      ) : null}
      <div role="status">
        <Text as="p" variant="footnote" color="grey-04">
          {notice.message}
        </Text>
      </div>
      {notice.actionLabel && notice.onAction ? (
        <HubPillButton analyticsLabel={`Lobby voice ${notice.actionLabel}`} onClick={notice.onAction}>
          {notice.actionLabel}
        </HubPillButton>
      ) : null}
    </div>
  );
}
