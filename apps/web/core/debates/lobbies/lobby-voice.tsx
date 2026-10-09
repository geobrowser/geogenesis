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
} from '@livekit/components-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import {
  ConnectionState,
  DisconnectReason,
  MediaDeviceFailure,
  ParticipantEvent,
  type Room,
  RoomEvent,
  type RoomOptions,
  Track,
  type TrackPublication,
} from 'livekit-client';

import { ExtendedReconnectPolicy } from '~/core/livekit/extended-reconnect-policy';

import { Text } from '~/design-system/text';

import { type DebateLobbyVoiceToken, dashlessId, getDebateLobbyVoiceToken } from '../api';
import { MicrophoneIcon } from '../debate-room-controls';
import { createDebateRoomOwnershipCoordinator } from '../debate-room-ownership';
import { useGeoChatAuth } from '../hooks';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { lobbyErrorMessage } from './lobby-format';
import type { MemberLobbyPageView } from './lobby-view';

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
function rolePublishes(lobby: MemberLobbyPageView) {
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
  // A listen-only token records the mic as off, so a later move to speakers or host starts muted.
  const listenOnly = data !== undefined && !data.can_publish;
  React.useEffect(() => {
    if (listenOnly) setMicChoice(false);
  }, [listenOnly]);

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
  const handleMediaDeviceFailure = React.useCallback((failure?: MediaDeviceFailure) => {
    setMicFailure(failure ?? null);
  }, []);
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

type VoiceNotice = { message: string; actionLabel?: string; onAction?: () => void };

function ConnectedVoice({
  canPublish,
  micFailure,
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
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const audible = connected && canPlayAudio;
  React.useEffect(() => {
    if (audible) onAudible?.();
  }, [audible, onAudible]);

  // A host's move to listeners revokes publishing in LiveKit at once, before the lobby refetch
  // brings the new role and a listen-only token; the mic goes down now.
  const permissions = useLocalParticipantPermissions();
  const mayPublish = canPublish && permissions?.canPublish !== false;
  React.useEffect(() => {
    if (!canPublish || mayPublish) return;
    onMicChoice(false);
    void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
  }, [canPublish, localParticipant, mayPublish, onMicChoice]);

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
              : isMicrophoneEnabled
                ? 'You’re on the mic'
                : 'You’re muted',
          }}
          mic={{ on: isMicrophoneEnabled && !micFailure, onToggle: setMicrophone }}
        />
      ) : (
        <VoiceBar notice={{ message: 'You’re listening' }} />
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

/** Who is speaking and whose mic is on in the room this sits in. */
function useParticipantVoiceStates(connected: boolean) {
  const participants = useParticipants();
  return React.useMemo<LobbyVoiceStates>(() => {
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

function VoiceBar({
  notice,
  mic,
}: {
  notice: VoiceNotice;
  mic?: { on: boolean; onToggle: (enabled: boolean) => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-grey-02 bg-white px-3 py-2">
      {mic ? (
        <HubPillButton
          variant={mic.on ? 'secondary' : 'primary'}
          analyticsLabel={mic.on ? 'Lobby mute' : 'Lobby unmute'}
          aria-pressed={!mic.on}
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
