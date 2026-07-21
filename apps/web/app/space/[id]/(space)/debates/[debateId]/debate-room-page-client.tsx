'use client';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import {
  type Debate,
  type DebateRematchSession,
  type LiveKitJoinResponse,
  type ParticipantSlot,
  getCurrentGeoChatUserId,
  getServerTime,
} from '~/core/debates/api';
import {
  useAbortDebate,
  useClearTimedOutDebateActivity,
  useConsentToDebateRematch,
  useDebate,
  useDebateRematch,
  useLeaveDebateRematch,
  useLiveKitJoin,
  useMarkDebateJoined,
  useMarkDebateReady,
} from '~/core/debates/hooks';
import {
  debateRecordingUploadId,
  deleteDebateRecordingUpload,
  enqueueDebateRecordingUpload,
  estimateRecordingStorage,
  getDebateRecordingUpload,
  isStorageQuotaError,
  requestPersistentRecordingStorage,
} from '~/core/debates/recording-upload-queue';
import { createLocalServerClock, synchronizeServerClock } from '~/core/debates/server-clock';
import { useDebatesEnabled, useFeatureFlag } from '~/core/state/feature-flags';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { Check } from '~/design-system/icons/check';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Text } from '~/design-system/text';

type DebateRoomPageClientProps = {
  spaceId: string;
  debateId: string;
};

type LocalTrackLike = {
  mediaStreamTrack: MediaStreamTrack;
  stop: () => void;
  detach?: () => void;
};

type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

type RemoteTrackLike = {
  kind: string;
  attach: () => HTMLElement;
  detach: () => HTMLMediaElement[];
};

type RoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  localParticipant: {
    publishTrack: (track: unknown) => Promise<unknown>;
  };
  on: (event: string, callback: (payload?: unknown) => void) => void;
};

type DebateCountdown = {
  label: string;
  remainingSeconds: number;
  progress: number;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
  elapsedMs: number;
};

type DebateRecordingWindow = {
  startAtMs: number;
  endAtMs: number;
};

const recordingOverlayTextShadow = {
  textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px #000',
};

// Label/phrase overlays in Figma are dark text with a white outline (the inverse of the big
// numbers and "GO!", which stay white-on-black via recordingOverlayTextShadow).
const recordingLabelTextShadow = {
  textShadow: '-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 4px 12px rgba(0,0,0,0.25)',
};

// Ring geometry lives in a 68-unit viewBox; the tile renders it at the Figma frame size (51px).
const recordingCountdownSize = 68;
const recordingCountdownRenderSize = 51;
const recordingCountdownRadius = 25;
const recordingCountdownCircumference = 2 * Math.PI * recordingCountdownRadius;

const debateThankingDurationMs = 20_000;
const debatePreflightDurationMs = 5_000;
const connectionFailureRedirectDelayMs = 750;
const maximumBrowserTimeoutMs = 2_147_483_647;

export function DebateRoomPageClient({ spaceId, debateId }: DebateRoomPageClientProps) {
  const isDebatesEnabled = useDebatesEnabled();
  const router = useRouter();

  React.useEffect(() => {
    if (!isDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [isDebatesEnabled, router, spaceId]);

  if (!isDebatesEnabled) return null;

  return <DebateRoomSurface spaceId={spaceId} debateId={debateId} />;
}

function DebateRoomSurface({ spaceId, debateId }: DebateRoomPageClientProps) {
  const router = useRouter();
  const debateQuery = useDebate(debateId, true);
  const refetchDebate = debateQuery.refetch;
  const liveKitJoin = useLiveKitJoin(debateId);
  const markJoined = useMarkDebateJoined(debateId);
  const markReady = useMarkDebateReady(debateId);
  const abortDebate = useAbortDebate(debateId);
  const clearTimedOutDebateActivity = useClearTimedOutDebateActivity();
  const consentToRematch = useConsentToDebateRematch(debateId);
  const [joinResponse, setJoinResponse] = React.useState<LiveKitJoinResponse | null>(null);
  const [roomState, setRoomState] = React.useState<'idle' | 'connecting' | 'reconnecting' | 'connected' | 'saving'>(
    'idle'
  );
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [remoteVideoReady, setRemoteVideoReady] = React.useState(false);
  const [previewState, setPreviewState] = React.useState<'idle' | 'starting' | 'ready'>('idle');
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [rematchConsentRequested, setRematchConsentRequested] = React.useState(false);
  const [audioMuted, setAudioMuted] = React.useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = React.useState(true);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const [serverClock, setServerClock] = React.useState(createLocalServerClock);
  const [serverClockSettled, setServerClockSettled] = React.useState(false);
  const [audioInputDevices, setAudioInputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [videoInputDevices, setVideoInputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = React.useState('');
  const [selectedVideoInputId, setSelectedVideoInputId] = React.useState('');
  const selectedAudioInputIdRef = React.useRef('');
  const selectedVideoInputIdRef = React.useRef('');
  const mountedRef = React.useRef(true);
  const previewGenerationRef = React.useRef(0);
  const connectionGenerationRef = React.useRef(0);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteMediaRef = React.useRef<HTMLDivElement>(null);
  const remoteAudioEnabledRef = React.useRef(remoteAudioEnabled);
  const roomRef = React.useRef<RoomLike | null>(null);
  const localTracksRef = React.useRef<LocalTrackLike[]>([]);
  const localMediaStreamRef = React.useRef<MediaStream | null>(null);
  const localPreviewPromiseRef = React.useRef<Promise<LocalTrackLike[]> | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const recordingEndedAtRef = React.useRef<number | null>(null);
  const recordingStartTimerRef = React.useRef<number | null>(null);
  const recordingStopTimerRef = React.useRef<number | null>(null);
  const autoConnectAttemptedRef = React.useRef<string | null>(null);
  const connectionFailureHandledRef = React.useRef(false);
  const connectionFailureRedirectTimerRef = React.useRef<number | null>(null);
  const remoteParticipantRefetchTimerRef = React.useRef<number | null>(null);
  const serverNowRef = React.useRef(serverClock.now);
  const finalizedDebateRef = React.useRef<string | null>(null);
  const recordingPersistenceStartedRef = React.useRef<string | null>(null);
  const recordingPersistencePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const persistedRecordingDebateIdRef = React.useRef<string | null>(null);
  const stoppedRecordingRef = React.useRef<{
    blob: Blob;
    mimeType: string;
    startedAtMs: number;
    endedAtMs: number;
    durationSeconds: number;
    width: number | null;
    height: number | null;
    framerate: number | null;
    videoBitsPerSecond: number | null;
  } | null>(null);
  const storagePersistenceRequestedRef = React.useRef(false);
  const recordingCancellationHandledRef = React.useRef<string | null>(null);
  const debate = debateQuery.data ?? null;
  const rematchQuery = useDebateRematch(
    debate?.rematch_session_id ?? '',
    Boolean(debate?.rematch_session_id) && debate?.status !== 'cancelled'
  );
  const leaveRematch = useLeaveDebateRematch(debate?.rematch_session_id ?? '');
  const countdown = useDebateCountdown(debate, serverClock.now);
  const currentUserId = getCurrentGeoChatUserId();
  const localSlot = joinResponse?.participant_slot ?? null;
  const recordingCancelledBy = debate?.recording_cancelled_by ?? null;
  const opponentCancelledRecording = recordingCancelledBy !== null && recordingCancelledBy !== currentUserId;
  const recordingCanceller =
    recordingCancelledBy !== null
      ? (debate?.participants.find(participant => participant.user_id === recordingCancelledBy) ?? null)
      : null;
  const localAudioEnabled = shouldEnableLocalAudio(
    debate ? countdown.effectiveStatus : null,
    countdown.activeSlot,
    localSlot,
    audioMuted
  );

  React.useEffect(() => {
    serverNowRef.current = serverClock.now;
  }, [serverClock]);

  React.useEffect(() => {
    setLocalTrackPreferences(localTracksRef.current, { audioEnabled: localAudioEnabled, videoEnabled });
  }, [localAudioEnabled, videoEnabled]);

  React.useEffect(() => {
    remoteAudioEnabledRef.current = remoteAudioEnabled;
    setRemoteMediaAudioEnabled(remoteMediaRef, remoteAudioEnabled);
  }, [remoteAudioEnabled]);

  const clearRecordingTimers = React.useCallback(() => {
    if (recordingStartTimerRef.current !== null) {
      window.clearTimeout(recordingStartTimerRef.current);
      recordingStartTimerRef.current = null;
    }
    if (recordingStopTimerRef.current !== null) {
      window.clearTimeout(recordingStopTimerRef.current);
      recordingStopTimerRef.current = null;
    }
  }, []);

  const startLocalRecorder = React.useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') return;
    if (recordingStartedAtRef.current !== null) return;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;
    const mimeType = preferredRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordingChunksRef.current = [];
    recordingEndedAtRef.current = null;
    recorder.addEventListener(
      'start',
      () => {
        recordingStartedAtRef.current = serverNowRef.current();
      },
      { once: true }
    );
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };
    recorder.start(1_000);
    recorderRef.current = recorder;
  }, []);

  const stopLocalRecorder = React.useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recordingEndedAtRef.current !== null) return;

    const stopped = new Promise<void>(resolve => {
      recorder.addEventListener(
        'stop',
        () => {
          recordingEndedAtRef.current = serverNowRef.current();
          resolve();
        },
        { once: true }
      );
    });
    if (recorder.state !== 'inactive') {
      recorder.requestData();
      recorder.stop();
      await stopped;
      return;
    }
    recordingEndedAtRef.current = serverNowRef.current();
  }, []);

  const performStoppedLocalRecordingPersistence = React.useCallback(async () => {
    if (persistedRecordingDebateIdRef.current === debate?.id) return true;

    const localParticipant =
      debate?.participants.find(participant => participant.participant_slot === joinResponse?.participant_slot) ??
      debate?.participants.find(participant => participant.user_id === currentUserId) ??
      null;
    if (!localParticipant || !debate) return false;

    const backendRecordingExists = debate.recordings.some(recording => recording.user_id === localParticipant.user_id);
    const queuedRecording = backendRecordingExists
      ? undefined
      : await getDebateRecordingUpload(debateRecordingUploadId(localParticipant.user_id, debate.id));
    if (backendRecordingExists || queuedRecording) {
      persistedRecordingDebateIdRef.current = debate.id;
      return true;
    }

    await stopLocalRecorder();

    const recorder = recorderRef.current;
    const startedAtMs = recordingStartedAtRef.current;
    const endedAtMs = recordingEndedAtRef.current;
    if (!recorder || !startedAtMs || !endedAtMs) return false;

    if (!stoppedRecordingRef.current) {
      const mimeType = recorder.mimeType || preferredRecordingMimeType() || 'video/webm';
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      if (blob.size === 0) return false;
      const videoSettings = localMediaStreamRef.current?.getVideoTracks()[0]?.getSettings?.();
      stoppedRecordingRef.current = {
        blob,
        mimeType,
        startedAtMs,
        endedAtMs,
        durationSeconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1_000)),
        width: videoSettings?.width ?? null,
        height: videoSettings?.height ?? null,
        framerate: videoSettings?.frameRate ?? null,
        videoBitsPerSecond: recorder.videoBitsPerSecond || null,
      };
    }

    const recording = stoppedRecordingRef.current;
    const storage = await estimateRecordingStorage();
    if (storage?.quota !== undefined && storage.usage !== undefined) {
      const availableBytes = storage.quota - storage.usage;
      if (availableBytes < recording.blob.size) {
        console.warn('[DebateRecording] browser storage estimate is below recording size', {
          availableBytes,
          recordingBytes: recording.blob.size,
        });
      }
    }

    try {
      await enqueueDebateRecordingUpload({
        userId: localParticipant.user_id,
        debateId: debate.id,
        blob: recording.blob,
        mimeType: recording.mimeType,
        startedAtMs: recording.startedAtMs,
        endedAtMs: recording.endedAtMs,
        durationSeconds: recording.durationSeconds,
        width: recording.width,
        height: recording.height,
        framerate: recording.framerate,
        videoBitsPerSecond: recording.videoBitsPerSecond,
      });
    } catch (error) {
      if (isStorageQuotaError(error)) {
        throw new Error(
          'There is not enough browser storage to save this recording. Free some device storage, then retry.'
        );
      }
      throw error;
    }

    persistedRecordingDebateIdRef.current = debate.id;
    recorderRef.current = null;
    recordingChunksRef.current = [];
    stoppedRecordingRef.current = null;
    recordingStartedAtRef.current = null;
    recordingEndedAtRef.current = null;
    return true;
  }, [currentUserId, debate, joinResponse?.participant_slot, stopLocalRecorder]);

  const persistStoppedLocalRecording = React.useCallback(() => {
    if (persistedRecordingDebateIdRef.current === debate?.id) return Promise.resolve(true);
    if (recordingPersistencePromiseRef.current) return recordingPersistencePromiseRef.current;
    const persistence = performStoppedLocalRecordingPersistence().finally(() => {
      recordingPersistencePromiseRef.current = null;
    });
    recordingPersistencePromiseRef.current = persistence;
    return persistence;
  }, [debate?.id, performStoppedLocalRecordingPersistence]);

  const persistRecordingAfterCapture = React.useCallback(() => {
    if (!debate || recordingPersistenceStartedRef.current === debate.id) return;
    recordingPersistenceStartedRef.current = debate.id;
    void persistStoppedLocalRecording()
      .then(persisted => {
        if (!persisted) recordingPersistenceStartedRef.current = null;
      })
      .catch(error => {
        recordingPersistenceStartedRef.current = null;
        setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
      });
  }, [debate, persistStoppedLocalRecording]);

  const discardLocalRecorder = React.useCallback(async () => {
    clearRecordingTimers();
    const recorder = recorderRef.current;
    if (!recorder) {
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = null;
      recordingEndedAtRef.current = null;
      stoppedRecordingRef.current = null;
      recordingPersistenceStartedRef.current = null;
      recordingPersistencePromiseRef.current = null;
      persistedRecordingDebateIdRef.current = null;
      return;
    }

    const stopped = new Promise<void>(resolve => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
    });
    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }
    recorderRef.current = null;
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = null;
    recordingEndedAtRef.current = null;
    stoppedRecordingRef.current = null;
    recordingPersistenceStartedRef.current = null;
    recordingPersistencePromiseRef.current = null;
    persistedRecordingDebateIdRef.current = null;
  }, [clearRecordingTimers]);

  const refreshMediaDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!mountedRef.current) return;
    const audioInputs = devices
      .filter(device => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));
    const videoInputs = devices
      .filter(device => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));

    setAudioInputDevices(audioInputs);
    setVideoInputDevices(videoInputs);
    setSelectedAudioInputId(current => {
      const next =
        current && audioInputs.some(device => device.deviceId === current) ? current : (audioInputs[0]?.deviceId ?? '');
      selectedAudioInputIdRef.current = next;
      return next;
    });
    setSelectedVideoInputId(current => {
      const next =
        current && videoInputs.some(device => device.deviceId === current) ? current : (videoInputs[0]?.deviceId ?? '');
      selectedVideoInputIdRef.current = next;
      return next;
    });
  }, []);

  const ensureLocalPreview = React.useCallback(
    async (
      options: {
        forceRestart?: boolean;
        audioInputId?: string;
        videoInputId?: string;
      } = {}
    ) => {
      if (!options.forceRestart && localTracksRef.current.length > 0 && localMediaStreamRef.current) {
        if (localVideoRef.current && localVideoRef.current.srcObject !== localMediaStreamRef.current) {
          localVideoRef.current.srcObject = localMediaStreamRef.current;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => undefined);
        }
        setPreviewState('ready');
        return localTracksRef.current;
      }
      if (localPreviewPromiseRef.current) {
        if (!options.forceRestart) return localPreviewPromiseRef.current;
        await localPreviewPromiseRef.current.catch(() => undefined);
      }

      setPreviewError(null);
      setPreviewState('starting');
      const generation = previewGenerationRef.current + 1;
      previewGenerationRef.current = generation;
      const isCurrent = () => mountedRef.current && previewGenerationRef.current === generation;
      const previewPromise = (async () => {
        const livekit = await import('livekit-client');
        if (!isCurrent()) return [];
        stopLocalTracks(localTracksRef);
        localMediaStreamRef.current = null;
        const audioInputId = options.audioInputId ?? selectedAudioInputIdRef.current;
        const videoInputId = options.videoInputId ?? selectedVideoInputIdRef.current;
        const tracks = (await livekit.createLocalTracks({
          audio: audioInputId ? { deviceId: audioInputId } : true,
          video: videoInputId ? { deviceId: videoInputId } : true,
        })) as LocalTrackLike[];
        if (!isCurrent()) {
          stopTracks(tracks);
          return [];
        }
        localTracksRef.current = tracks;
        setLocalTrackPreferences(tracks, {
          audioEnabled: shouldEnableLocalAudio(countdown.effectiveStatus, countdown.activeSlot, localSlot, audioMuted),
          videoEnabled,
        });
        const stream = new MediaStream(tracks.map(track => track.mediaStreamTrack));
        localMediaStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
          await localVideoRef.current.play().catch(() => undefined);
        }
        await refreshMediaDevices();
        if (!isCurrent()) {
          stopLocalTracks(localTracksRef);
          localMediaStreamRef.current = null;
          return [];
        }
        setPreviewState('ready');
        return tracks;
      })();
      localPreviewPromiseRef.current = previewPromise;
      try {
        return await previewPromise;
      } catch (error) {
        if (isCurrent()) {
          setPreviewError(error instanceof Error ? error.message : 'Could not start your camera preview.');
          setPreviewState('idle');
        }
        throw error;
      } finally {
        if (localPreviewPromiseRef.current === previewPromise) {
          localPreviewPromiseRef.current = null;
        }
      }
    },
    [audioMuted, countdown.activeSlot, countdown.effectiveStatus, localSlot, refreshMediaDevices, videoEnabled]
  );

  const changeAudioInput = React.useCallback(
    (deviceId: string) => {
      selectedAudioInputIdRef.current = deviceId;
      setSelectedAudioInputId(deviceId);
      void ensureLocalPreview({
        forceRestart: true,
        audioInputId: deviceId,
        videoInputId: selectedVideoInputIdRef.current,
      }).catch(() => undefined);
    },
    [ensureLocalPreview]
  );

  const changeVideoInput = React.useCallback(
    (deviceId: string) => {
      selectedVideoInputIdRef.current = deviceId;
      setSelectedVideoInputId(deviceId);
      void ensureLocalPreview({
        forceRestart: true,
        audioInputId: selectedAudioInputIdRef.current,
        videoInputId: deviceId,
      }).catch(() => undefined);
    },
    [ensureLocalPreview]
  );

  const connect = React.useCallback(async () => {
    const generation = connectionGenerationRef.current + 1;
    connectionGenerationRef.current = generation;
    const isCurrent = () => mountedRef.current && connectionGenerationRef.current === generation;
    let connectingRoom: RoomLike | null = null;
    let newlyCreatedTracks: LocalTrackLike[] = [];
    setRoomError(null);
    setRoomState('connecting');
    setServerClockSettled(false);
    setRemoteVideoReady(false);
    if (remoteParticipantRefetchTimerRef.current !== null) {
      window.clearTimeout(remoteParticipantRefetchTimerRef.current);
      remoteParticipantRefetchTimerRef.current = null;
    }
    remoteMediaRef.current?.replaceChildren();
    void synchronizeServerClock(getServerTime)
      .then(clock => {
        if (isCurrent()) setServerClock(clock);
      })
      .catch(() => null)
      .finally(() => {
        if (isCurrent()) setServerClockSettled(true);
      });

    try {
      const token = await liveKitJoin.mutateAsync();
      if (!isCurrent()) return;
      setJoinResponse(token);

      const livekit = await import('livekit-client');
      if (!isCurrent()) return;
      // A debate is a live, recorded 1:1 call, so both cameras must stream the whole time.
      // adaptiveStream pauses a subscribed remote video when it judges the element off-screen or
      // too small, and dynacast stops publishing layers no one is consuming; together they black
      // out a tile mid-turn.
      const room = new livekit.Room({ adaptiveStream: false, dynacast: false }) as unknown as RoomLike;
      connectingRoom = room;
      room.on(livekit.RoomEvent.TrackSubscribed, payload => {
        const track = payload as RemoteTrackLike;
        const element = track.attach();
        if (element instanceof HTMLMediaElement) {
          element.muted = !remoteAudioEnabledRef.current;
        }
        if (element instanceof HTMLVideoElement) {
          element.className = 'h-full w-full object-contain';
          element.playsInline = true;
          setRemoteVideoReady(true);
        } else if (element instanceof HTMLAudioElement) {
          element.className = 'hidden';
        }
        remoteMediaRef.current?.appendChild(element);
        void refetchDebate();
      });
      // When a remote track drops mid-debate, detach its element instead of leaving a frozen black
      // tile. Resetting remoteVideoReady flips the tile back to "Waiting for video" so a later
      // re-subscribe attaches a fresh element rather than stacking a second one behind it.
      room.on(livekit.RoomEvent.TrackUnsubscribed, payload => {
        const track = payload as RemoteTrackLike;
        for (const element of track.detach()) element.remove();
        if (track.kind === 'video') setRemoteVideoReady(false);
      });
      room.on(livekit.RoomEvent.ParticipantConnected, () => {
        if (!isCurrent()) return;
        void refetchDebate();
        remoteParticipantRefetchTimerRef.current = window.setTimeout(() => {
          remoteParticipantRefetchTimerRef.current = null;
          if (isCurrent()) void refetchDebate();
        }, 250);
      });
      // LiveKit runs its own ICE-restart reconnection; surface it so a debater whose connection
      // blips sees "Reconnecting" instead of a silently frozen call. Clear the remote
      // tiles on the way out so stale elements from the dropped session don't linger behind the
      // re-subscribed tracks.
      room.on(livekit.RoomEvent.Reconnecting, () => {
        if (!isCurrent() || roomRef.current !== room) return;
        remoteMediaRef.current?.replaceChildren();
        setRemoteVideoReady(false);
        setRoomState('reconnecting');
      });
      room.on(livekit.RoomEvent.Reconnected, () => {
        if (!isCurrent() || roomRef.current !== room) return;
        setRoomState('connected');
      });
      // A non-client-initiated Disconnected means auto-reconnect gave up. Our own teardown always
      // disconnects with CLIENT_INITIATED, so this branch only fires on a genuinely dropped call:
      // tear the room down and return to idle, where the "Retry connection" affordance lives.
      room.on(livekit.RoomEvent.Disconnected, payload => {
        if (!isCurrent() || roomRef.current !== room) return;
        if (payload === livekit.DisconnectReason.CLIENT_INITIATED) return;
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setRoomError('Lost connection to the debate room.');
        setRoomState('idle');
      });

      await room.connect(token.url, token.token);
      if (!isCurrent()) {
        room.disconnect();
        return;
      }
      roomRef.current = room;
      const hasPreviewTracks = localTracksRef.current.length > 0;
      const tracks = hasPreviewTracks
        ? localTracksRef.current
        : ((await livekit.createLocalTracks({
            audio: selectedAudioInputIdRef.current ? { deviceId: selectedAudioInputIdRef.current } : true,
            video: selectedVideoInputIdRef.current ? { deviceId: selectedVideoInputIdRef.current } : true,
          })) as LocalTrackLike[]);
      if (!hasPreviewTracks) newlyCreatedTracks = tracks;
      if (!isCurrent()) {
        room.disconnect();
        stopTracks(newlyCreatedTracks);
        if (roomRef.current === room) roomRef.current = null;
        return;
      }
      localTracksRef.current = tracks;
      setLocalTrackPreferences(tracks, {
        audioEnabled: shouldEnableLocalAudio(
          countdown.effectiveStatus,
          countdown.activeSlot,
          token.participant_slot,
          audioMuted
        ),
        videoEnabled,
      });

      // Mark joined now that we're in the room and hold local media, before publishing. publishTrack
      // awaits WebRTC media negotiation (ICE/TURN), which between two peers behind NAT can take
      // several seconds; that's long enough to miss the server's connecting deadline and get the
      // debate cancelled with connection_timeout even though both participants are present.
      await markJoined.mutateAsync();
      if (!isCurrent()) {
        room.disconnect();
        stopLocalTracks(localTracksRef);
        localMediaStreamRef.current = null;
        if (roomRef.current === room) roomRef.current = null;
        return;
      }

      for (const track of tracks) {
        await publishTrackWithRetry(room, track, isCurrent);
        if (!isCurrent()) {
          room.disconnect();
          stopLocalTracks(localTracksRef);
          localMediaStreamRef.current = null;
          if (roomRef.current === room) roomRef.current = null;
          return;
        }
      }

      const stream = new MediaStream(tracks.map(track => track.mediaStreamTrack));
      localMediaStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => undefined);
      }

      if (!isCurrent()) {
        room.disconnect();
        stopLocalTracks(localTracksRef);
        localMediaStreamRef.current = null;
        if (roomRef.current === room) roomRef.current = null;
        return;
      }
      setRoomState('connected');
    } catch (error) {
      if (connectingRoom && roomRef.current !== connectingRoom) {
        connectingRoom.disconnect();
        stopTracks(newlyCreatedTracks);
      }
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
      if (isCurrent()) {
        setRoomError(error instanceof Error ? error.message : 'Could not join the debate room.');
        setRoomState(debate?.status === 'connecting' ? 'connecting' : 'idle');
      }
    }
  }, [
    audioMuted,
    countdown.activeSlot,
    countdown.effectiveStatus,
    debate?.status,
    liveKitJoin,
    markJoined,
    refetchDebate,
    videoEnabled,
  ]);

  const toggleAudioMuted = React.useCallback(() => {
    setAudioMuted(current => !current);
  }, []);

  const toggleRemoteAudioEnabled = React.useCallback(() => {
    setRemoteAudioEnabled(current => !current);
  }, []);

  const toggleVideoEnabled = React.useCallback(() => {
    setVideoEnabled(current => !current);
  }, []);

  const finishAndPersist = React.useCallback(async () => {
    setRoomError(null);
    setRoomState('saving');
    try {
      const persisted = await persistStoppedLocalRecording();
      if (!persisted) {
        throw new Error('No local recording was available to save.');
      }
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
      setRemoteVideoReady(false);
      setRoomState('idle');
      return true;
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
      setRoomState('connected');
      return false;
    }
  }, [persistStoppedLocalRecording]);

  const finishLiveDebate = React.useCallback(async () => {
    if (!debate || finalizedDebateRef.current === debate.id) return;
    const session = rematchQuery.data;
    if (debate.rematch_session_id && (!session || session.status === 'deciding')) return;
    finalizedDebateRef.current = debate.id;
    const persisted = await finishAndPersist();
    if (!persisted) return;
    if (session?.status === 'converted' && session.converted_debate_id) {
      router.replace(`/space/${session.source_space_id}/debates/${session.converted_debate_id}`);
      return;
    }
    if (session && ['browsing', 'request_pending'].includes(session.status)) {
      router.replace(`/space/${session.source_space_id}/debates/rematches/${session.id}`);
      return;
    }
    router.replace(`/space/${spaceId}/debates`);
  }, [debate, finishAndPersist, rematchQuery.data, router, spaceId]);

  const retryLiveDebateFinalization = React.useCallback(() => {
    if (debate?.status === 'thanking') {
      setRoomError(null);
      setRoomState('saving');
      recordingPersistenceStartedRef.current = debate.id;
      void persistStoppedLocalRecording()
        .then(persisted => {
          if (!persisted) throw new Error('No local recording was available to save.');
          setRoomState('connected');
        })
        .catch(error => {
          recordingPersistenceStartedRef.current = null;
          setRoomError(error instanceof Error ? error.message : 'Could not save the local recording.');
          setRoomState('connected');
        });
      return;
    }
    finalizedDebateRef.current = null;
    void finishLiveDebate();
  }, [debate?.id, debate?.status, finishLiveDebate, persistStoppedLocalRecording]);

  const requestRematch = React.useCallback(async () => {
    if (rematchConsentRequested) return;
    setRoomError(null);
    setRematchConsentRequested(true);
    try {
      await consentToRematch.mutateAsync();
    } catch (error) {
      setRematchConsentRequested(false);
      setRoomError(error instanceof Error ? error.message : 'Could not request another debate.');
    }
  }, [consentToRematch, rematchConsentRequested]);

  const markLocalReady = React.useCallback(async () => {
    setRoomError(null);
    setPreviewError(null);
    try {
      await ensureLocalPreview();
      await markReady.mutateAsync();
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not mark you ready.');
    }
  }, [ensureLocalPreview, markReady]);

  const leave = React.useCallback(async () => {
    if (!debate) return;
    setRoomError(null);
    try {
      if (debate.status === 'complete') {
        await finishLiveDebate();
        return;
      } else if (debate.status === 'thanking' && debate.rematch_session_id) {
        const persisted = await persistStoppedLocalRecording();
        if (!persisted) {
          throw new Error('Could not save the local recording. Please try leaving again.');
        }
        await leaveRematch.mutateAsync();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRoomState('idle');
      } else if (debate.status === 'cancelled') {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setRoomState('idle');
      } else {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        await abortDebate.mutateAsync();
      }
      router.push(`/space/${spaceId}/debates`);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not leave the debate.');
    }
  }, [
    abortDebate,
    debate,
    discardLocalRecorder,
    finishLiveDebate,
    leaveRematch,
    persistStoppedLocalRecording,
    router,
    spaceId,
  ]);

  const handleConnectionFailure = React.useCallback(() => {
    if (connectionFailureHandledRef.current) return;
    connectionFailureHandledRef.current = true;
    connectionGenerationRef.current += 1;
    if (remoteParticipantRefetchTimerRef.current !== null) {
      window.clearTimeout(remoteParticipantRefetchTimerRef.current);
      remoteParticipantRefetchTimerRef.current = null;
    }
    clearTimedOutDebateActivity(debateId);
    clearRecordingTimers();
    void discardLocalRecorder();
    disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    localMediaStreamRef.current = null;
    setRemoteVideoReady(false);
    setRoomError('Connection failed. Finding another match.');
    setRoomState('connecting');
  }, [clearRecordingTimers, clearTimedOutDebateActivity, debateId, discardLocalRecorder]);

  const redirectAfterConnectionFailure = React.useCallback(() => {
    if (connectionFailureRedirectTimerRef.current !== null) return;
    connectionFailureRedirectTimerRef.current = window.setTimeout(() => {
      router.replace(`/space/${spaceId}/questions`);
    }, connectionFailureRedirectDelayMs);
  }, [router, spaceId]);

  const reconcileConnectionDeadline = React.useCallback(async () => {
    const generation = connectionGenerationRef.current;
    const result = await refetchDebate().catch(() => null);
    if (!mountedRef.current || connectionGenerationRef.current !== generation) return;
    if (result?.data?.status !== 'cancelled' || result.data.cancellation_reason !== 'connection_timeout') return;
    handleConnectionFailure();
    redirectAfterConnectionFailure();
  }, [handleConnectionFailure, redirectAfterConnectionFailure, refetchDebate]);

  React.useEffect(() => {
    if (!debate || debate.status !== 'connecting') return;
    const deadline = timestampMs(debate.connecting_deadline_at);
    if (deadline === null) return;
    const remainingMs = deadline - serverClock.now();
    if (remainingMs <= 0) {
      void reconcileConnectionDeadline();
      return;
    }
    const timer = window.setTimeout(
      () => void reconcileConnectionDeadline(),
      Math.min(remainingMs, maximumBrowserTimeoutMs)
    );
    return () => window.clearTimeout(timer);
  }, [debate, reconcileConnectionDeadline, serverClock]);

  React.useEffect(() => {
    if (debate?.status === 'cancelled' && debate.cancellation_reason === 'connection_timeout') {
      handleConnectionFailure();
      redirectAfterConnectionFailure();
    }
  }, [debate?.cancellation_reason, debate?.status, handleConnectionFailure, redirectAfterConnectionFailure]);

  React.useEffect(() => {
    const resumingAfterEffectCleanup = !mountedRef.current;
    mountedRef.current = true;
    if (resumingAfterEffectCleanup) {
      localPreviewPromiseRef.current = null;
      autoConnectAttemptedRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      previewGenerationRef.current += 1;
      connectionGenerationRef.current += 1;
      if (connectionFailureRedirectTimerRef.current !== null) {
        window.clearTimeout(connectionFailureRedirectTimerRef.current);
        connectionFailureRedirectTimerRef.current = null;
      }
      if (remoteParticipantRefetchTimerRef.current !== null) {
        window.clearTimeout(remoteParticipantRefetchTimerRef.current);
        remoteParticipantRefetchTimerRef.current = null;
      }
      clearRecordingTimers();
      void discardLocalRecorder();
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      localMediaStreamRef.current = null;
    };
  }, [clearRecordingTimers, discardLocalRecorder]);

  React.useEffect(() => {
    if (!debate || storagePersistenceRequestedRef.current) return;
    if (['complete', 'cancelled'].includes(debate.status)) return;
    storagePersistenceRequestedRef.current = true;
    void requestPersistentRecordingStorage();
  }, [debate]);

  React.useEffect(() => {
    if (!debate || debate.status !== 'ready' || roomState !== 'idle') return;
    void ensureLocalPreview().catch(() => undefined);
  }, [debate, ensureLocalPreview, roomState]);

  React.useEffect(() => {
    if (!debate || roomState !== 'idle') return;
    if (connectionFailureHandledRef.current) return;
    if (['complete', 'cancelled'].includes(debate.status)) return;
    if (debate.status === 'ready') return;
    if (autoConnectAttemptedRef.current === debate.id) return;
    autoConnectAttemptedRef.current = debate.id;
    void connect();
  }, [connect, debate, roomState]);

  React.useEffect(() => {
    clearRecordingTimers();
    if (!debate || roomState !== 'connected' || !serverClockSettled) return;

    const stream = localMediaStreamRef.current;
    if (!stream) return;

    const recordingWindow = recordingWindowForDebate(debate);
    if (!recordingWindow) return;

    if (debate.status === 'thanking') {
      persistRecordingAfterCapture();
      return;
    }
    if (debate.status !== 'preflight' && debate.status !== 'in_progress') return;

    const now = serverClock.now();
    if (now >= recordingWindow.endAtMs) {
      persistRecordingAfterCapture();
      return;
    }

    if (recordingStartedAtRef.current === null) {
      recordingStartTimerRef.current = window.setTimeout(
        () => startLocalRecorder(stream),
        Math.max(0, recordingWindow.startAtMs - now)
      );
    }
    recordingStopTimerRef.current = window.setTimeout(
      () => {
        persistRecordingAfterCapture();
      },
      Math.max(0, recordingWindow.endAtMs - now)
    );

    return clearRecordingTimers;
  }, [
    clearRecordingTimers,
    debate,
    persistRecordingAfterCapture,
    roomState,
    serverClock,
    serverClockSettled,
    startLocalRecorder,
  ]);

  React.useEffect(() => {
    if (!debate) return;
    if (roomState === 'idle') return;
    if (debate.status === 'cancelled') {
      if (debate.cancellation_reason === 'connection_timeout') return;
      void discardLocalRecorder().finally(() => {
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        localMediaStreamRef.current = null;
        setRemoteVideoReady(false);
        setRoomState('idle');
      });
      return;
    }
    if (debate.status !== 'complete') return;
    if (debate.rematch_session_id && !rematchQuery.data) return;
    void finishLiveDebate();
  }, [debate, discardLocalRecorder, finishLiveDebate, rematchQuery.data, roomState]);

  React.useEffect(() => {
    if (!debate || recordingCancelledBy === null) return;
    if (recordingCancellationHandledRef.current === debate.id) return;
    recordingCancellationHandledRef.current = debate.id;
    // The recording is gone for both sides. Block the normal finalize/redirect path and make
    // sure nothing from this tab tries to publish the local blob.
    finalizedDebateRef.current = debate.id;
    if (currentUserId) {
      void deleteDebateRecordingUpload(debateRecordingUploadId(currentUserId, debate.id)).catch(() => undefined);
    }
    void discardLocalRecorder();
    disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    localMediaStreamRef.current = null;
    setRemoteVideoReady(false);
    setRoomState('idle');
    // The canceller already saw the confirmation in the upload banner; only the opponent needs
    // the "your debate was removed" popup, so send the canceller straight back to the list.
    if (!opponentCancelledRecording) {
      router.replace(`/space/${spaceId}/debates`);
    }
  }, [currentUserId, debate, discardLocalRecorder, opponentCancelledRecording, recordingCancelledBy, router, spaceId]);

  return (
    <div className="py-8">
      {debate && opponentCancelledRecording && (
        <DebateRecordingRemovedDialog
          cancellerName={recordingCanceller ? speakerName(recordingCanceller) : 'Your opponent'}
          claim={debate.claim.claim}
          onAcknowledge={() => router.replace(`/space/${spaceId}/debates`)}
        />
      )}

      {debate?.status !== 'ready' && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Text as="h2" variant="smallTitle" color="text">
              Debate room
            </Text>
            {debate && (
              <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[760px]">
                {debate.claim.claim}
              </Text>
            )}
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(`/space/${spaceId}/debates`)}>
            Back to debates
          </Button>
        </div>
      )}

      {debateQuery.isLoading && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text color="grey-04">Loading debate...</Text>
        </div>
      )}

      {debateQuery.error instanceof Error && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-4">
          <Text color="red-01">{debateQuery.error.message}</Text>
        </div>
      )}

      {debate &&
        (debate.status === 'ready' ? (
          <DebatePreScreen
            debate={debate}
            currentUserId={currentUserId}
            localVideoRef={localVideoRef}
            previewState={previewState}
            error={roomError ?? previewError}
            audioInputDevices={audioInputDevices}
            videoInputDevices={videoInputDevices}
            selectedAudioInputId={selectedAudioInputId}
            selectedVideoInputId={selectedVideoInputId}
            onAudioInputChange={changeAudioInput}
            onVideoInputChange={changeVideoInput}
            readyBusy={markReady.isPending}
            onReady={markLocalReady}
            onLeave={leave}
            leaveDisabled={abortDebate.isPending}
          />
        ) : (
          <>
            <section className="rounded-lg border border-grey-02 bg-white p-5 shadow-light">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <Text as="h3" variant="bodySemibold" color="text">
                    {statusLabel(debate.status)}
                  </Text>
                  <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[760px]">
                    {speakerStatus(debate)}
                  </Text>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {debate.participants.map(participant => (
                      <span
                        key={participant.user_id}
                        className="inline-flex max-w-full items-center rounded-md border border-grey-02 bg-bg px-2 py-1 text-[0.8125rem] text-text"
                      >
                        <span className="truncate">
                          {participant.display_name || participant.profile_space_id} · {participant.position_label}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {roomError && roomState === 'idle' && !['complete', 'cancelled'].includes(debate.status) && (
                    <Button type="button" onClick={connect} disabled={liveKitJoin.isPending || markJoined.isPending}>
                      Retry connection
                    </Button>
                  )}
                  <Button type="button" variant="secondary" onClick={() => router.push(`/space/${spaceId}/debates`)}>
                    Back to debates
                  </Button>
                </div>
              </div>

              {roomError && roomState === 'idle' && (
                <div className="mt-4 rounded-lg border border-red-01 bg-white px-5 py-4">
                  <Text color="red-01">{roomError}</Text>
                </div>
              )}
            </section>

            {roomState !== 'idle' && (
              <DebateRecordingModal
                debate={debate}
                roomState={roomState}
                roomError={roomError}
                countdown={countdown}
                localSlot={joinResponse?.participant_slot ?? null}
                localVideoRef={localVideoRef}
                remoteMediaRef={remoteMediaRef}
                remoteVideoReady={remoteVideoReady}
                audioMuted={audioMuted}
                remoteAudioEnabled={remoteAudioEnabled}
                videoEnabled={videoEnabled}
                onToggleAudioMuted={toggleAudioMuted}
                onToggleRemoteAudioEnabled={toggleRemoteAudioEnabled}
                onToggleVideoEnabled={toggleVideoEnabled}
                rematchSession={rematchQuery.data ?? null}
                currentUserId={currentUserId}
                onRequestRematch={requestRematch}
                rematchConsentRequested={rematchConsentRequested}
                rematchBusy={consentToRematch.isPending}
                onRetryFinalization={retryLiveDebateFinalization}
                onRetryConnection={connect}
                onLeave={leave}
                leaveDisabled={abortDebate.isPending || roomState === 'saving'}
              />
            )}
          </>
        ))}
    </div>
  );
}

function DebatePreScreen({
  debate,
  currentUserId,
  localVideoRef,
  previewState,
  error,
  audioInputDevices,
  videoInputDevices,
  selectedAudioInputId,
  selectedVideoInputId,
  onAudioInputChange,
  onVideoInputChange,
  readyBusy,
  onReady,
  onLeave,
  leaveDisabled,
}: {
  debate: Debate;
  currentUserId: string | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  previewState: 'idle' | 'starting' | 'ready';
  error: string | null;
  audioInputDevices: MediaDeviceOption[];
  videoInputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  selectedVideoInputId: string;
  onAudioInputChange: (deviceId: string) => void;
  onVideoInputChange: (deviceId: string) => void;
  readyBusy: boolean;
  onReady: () => void;
  onLeave: () => void;
  leaveDisabled: boolean;
}) {
  const participants = [...debate.participants].sort((a, b) => a.participant_slot - b.participant_slot);
  const localParticipant =
    participants.find(participant => participant.user_id === currentUserId) ?? participants[0] ?? null;
  const remoteParticipant =
    participants.find(participant => participant.user_id !== localParticipant?.user_id) ?? participants[1] ?? null;
  const localReady = Boolean(localParticipant?.ready_at);
  const remoteReady = Boolean(remoteParticipant?.ready_at);

  React.useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalDocumentOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocumentOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Debate readiness"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text"
    >
      <section className="mx-auto flex min-h-dvh w-full max-w-[920px] flex-col items-center justify-start px-5 py-6 text-center md:justify-center">
        <Text as="p" variant="cardEntityTitle" color="grey-04">
          Debate
        </Text>
        <h1 className="mt-3 max-w-[560px] text-[2.5rem] leading-[1.05] font-semibold text-text md:max-w-[870px] md:text-[3.625rem] md:leading-[0.93]">
          {debate.claim.claim}
        </h1>

        <div className="mt-10 w-full max-w-[272px]">
          <PreScreenOpponent
            participant={remoteParticipant}
            label={remoteParticipant ? speakerName(remoteParticipant) : 'Other speaker'}
            ready={remoteReady}
          />
        </div>

        <div className="mt-3 w-full max-w-[272px] rounded-lg border border-grey-02 bg-white p-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-grey-01">
            <video ref={localVideoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            {previewState !== 'ready' && (
              <div className="absolute inset-0 grid place-items-center bg-grey-01">
                <Text variant="body" color="grey-04">
                  {previewState === 'starting' ? 'Starting camera...' : 'Camera preview unavailable'}
                </Text>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <PreScreenDeviceSelect
              ariaLabel="Select microphone"
              icon={<MicrophoneIcon muted={false} />}
              value={selectedAudioInputId}
              options={audioInputDevices}
              fallbackLabel="Microphone"
              onChange={onAudioInputChange}
            />
            <PreScreenDeviceSelect
              ariaLabel="Select camera"
              icon={<CameraIcon disabled={false} />}
              value={selectedVideoInputId}
              options={videoInputDevices}
              fallbackLabel="Camera"
              onChange={onVideoInputChange}
            />
          </div>
        </div>

        {error && (
          <Text as="p" variant="metadata" color="red-01" className="mt-3">
            {error}
          </Text>
        )}

        <button
          type="button"
          onClick={onReady}
          disabled={readyBusy || localReady}
          className="mt-3 flex min-h-11 w-full max-w-[272px] items-center justify-center rounded-full bg-text px-5 text-button text-white transition-colors hover:bg-text/90 disabled:opacity-50"
        >
          {localReady ? 'Waiting...' : readyBusy ? 'Saving...' : 'Accept'}
        </button>

        <div className="mt-5">
          <RecordingCircleButton
            ariaLabel="Leave debate"
            title="Leave debate"
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            <LeaveIcon />
          </RecordingCircleButton>
        </div>
      </section>
    </div>
  );
}

function PreScreenDeviceSelect({
  ariaLabel,
  icon,
  value,
  options,
  fallbackLabel,
  onChange,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  value: string;
  options: MediaDeviceOption[];
  fallbackLabel: string;
  onChange: (deviceId: string) => void;
}) {
  const selectOptions = options.length > 0 ? options : [{ deviceId: '', label: fallbackLabel }];

  return (
    <label className="relative flex min-w-0 items-center rounded-full border border-grey-02 bg-white px-3 py-2 text-left text-metadata text-text">
      <span className="mr-2 shrink-0 text-text">{icon}</span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={options.length === 0}
        className="min-w-0 flex-1 appearance-none bg-transparent pr-6 text-metadata text-text outline-none disabled:text-grey-04"
      >
        {selectOptions.map(device => (
          <option key={device.deviceId || fallbackLabel} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 grid size-4 place-items-center">
        <ChevronDownSmall color="grey-04" />
      </span>
    </label>
  );
}

function PreScreenOpponent({
  participant,
  label,
  ready,
}: {
  participant: Debate['participants'][number] | null;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex min-h-[52px] w-full items-center justify-between gap-4 rounded-lg border border-grey-02 bg-white px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={participant?.avatar_cid ?? null}
            value={participant?.profile_space_id ?? label}
            alt={label}
            size={20}
          />
        </span>
        <Text as="div" variant="metadata" color="text" className="min-w-0 truncate text-left">
          {label}
        </Text>
      </div>
      <span
        className={cx(
          'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-metadata leading-none',
          ready ? 'bg-green text-text' : 'bg-grey-01 text-grey-04'
        )}
      >
        {ready && <Check />}
        {ready ? 'Ready' : 'Waiting...'}
      </span>
    </div>
  );
}

function DebateRecordingModal({
  debate,
  roomState,
  roomError,
  countdown,
  localSlot,
  localVideoRef,
  remoteMediaRef,
  remoteVideoReady,
  audioMuted,
  remoteAudioEnabled,
  videoEnabled,
  onToggleAudioMuted,
  onToggleRemoteAudioEnabled,
  onToggleVideoEnabled,
  rematchSession,
  currentUserId,
  onRequestRematch,
  rematchConsentRequested,
  rematchBusy,
  onRetryFinalization,
  onRetryConnection,
  onLeave,
  leaveDisabled,
}: {
  debate: Debate;
  roomState: 'connecting' | 'reconnecting' | 'connected' | 'saving';
  roomError: string | null;
  countdown: DebateCountdown;
  localSlot: ParticipantSlot | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteMediaRef: React.RefObject<HTMLDivElement | null>;
  remoteVideoReady: boolean;
  audioMuted: boolean;
  remoteAudioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleRemoteAudioEnabled: () => void;
  onToggleVideoEnabled: () => void;
  rematchSession: DebateRematchSession | null;
  currentUserId: string | null;
  onRequestRematch: () => void;
  rematchConsentRequested: boolean;
  rematchBusy: boolean;
  onRetryFinalization: () => void;
  onRetryConnection: () => void;
  onLeave: () => void;
  leaveDisabled: boolean;
}) {
  const debateDebuggingEnabled = useFeatureFlag('debateDebugging');
  const localParticipant =
    (localSlot
      ? debate.participants.find(participant => participant.participant_slot === localSlot)
      : debate.participants.find(participant => participant.user_id === currentUserId)) ?? null;
  const remoteParticipant =
    debate.participants.find(participant => participant.user_id !== localParticipant?.user_id) ?? null;
  const localUpcomingSeconds = localTurnStartsInSeconds(debate, countdown, localSlot);
  const localUpcomingLabel = upcomingTurnIsRebuttal(debate, countdown) ? 'Rebut in' : "You're up in";
  const showLocalGo = localTurnGoIsVisible(countdown, localSlot);
  const showLocalWrapItUp = wrapItUpIsVisible(countdown, localSlot);
  const showRemoteWrapItUp = wrapItUpIsVisible(countdown, remoteParticipant?.participant_slot ?? null);
  const showLocalDebateEndsSoon = debateEndsSoonIsVisible(debate, countdown, localSlot);
  const thankingSlot = thankingParticipantSlot(debate, countdown);
  const localInactive = participantIsInactive(countdown.effectiveStatus, localSlot, countdown.activeSlot);
  const remoteInactive = participantIsInactive(
    countdown.effectiveStatus,
    remoteParticipant?.participant_slot ?? null,
    countdown.activeSlot
  );
  const countdownRing = countdown.remainingSeconds > 0 ? <RecordingCountdownRing countdown={countdown} /> : null;
  const sharedPhaseCountdown = countdown.activeSlot === null ? countdownRing : null;
  const localCountdown = countdown.activeSlot === localSlot ? countdownRing : sharedPhaseCountdown;
  const remoteCountdown =
    countdown.activeSlot === remoteParticipant?.participant_slot ? countdownRing : sharedPhaseCountdown;
  const localRematchParticipant = rematchSession?.participants.find(
    participant => participant.user_id === currentUserId
  );
  const remoteRematchParticipant = rematchSession?.participants.find(
    participant => participant.user_id !== currentUserId
  );
  const localConsented = Boolean(localRematchParticipant?.consented_at);
  const remoteConsented = Boolean(remoteRematchParticipant?.consented_at);
  const connecting = countdown.effectiveStatus === 'connecting';
  const localVideoTile = (
    <DebateVideoTile
      key="local"
      participantPosition={localParticipant?.position ?? null}
      active={countdown.effectiveStatus === 'in_progress' && countdown.activeSlot === localSlot}
      overlayText={
        connecting
          ? roomState === 'connected' || Boolean(localParticipant?.joined_at)
            ? 'Connected'
            : 'Connecting'
          : videoEnabled
            ? null
            : 'Camera off'
      }
      upcomingSeconds={localUpcomingSeconds}
      upcomingLabel={localUpcomingLabel}
      showGo={showLocalGo}
      showWrapItUp={showLocalWrapItUp}
      showDebateEndsSoon={showLocalDebateEndsSoon}
      inactive={localInactive}
      revealInactive={localUpcomingSeconds !== null || showLocalDebateEndsSoon}
      inactiveOverlayId="local"
      countdown={localCountdown}
      closingMessage={
        countdown.effectiveStatus === 'thanking' &&
        thankingSlot !== null &&
        localSlot !== null &&
        thankingSlot === localSlot
      }
    >
      <video ref={localVideoRef} className="h-full w-full bg-grey-01 object-cover" playsInline muted autoPlay />
    </DebateVideoTile>
  );
  const remoteVideoTile = (
    <DebateVideoTile
      key="remote"
      participantPosition={remoteParticipant?.position ?? null}
      active={
        countdown.effectiveStatus === 'in_progress' && countdown.activeSlot === remoteParticipant?.participant_slot
      }
      overlayText={
        connecting
          ? remoteParticipant?.joined_at
            ? 'Connected'
            : 'Connecting'
          : remoteVideoReady
            ? null
            : 'Waiting for video'
      }
      showWrapItUp={showRemoteWrapItUp}
      inactive={remoteInactive}
      inactiveOverlayId="remote"
      countdown={remoteCountdown}
    >
      <div
        ref={remoteMediaRef}
        className="h-full w-full bg-grey-01 [&>audio]:hidden [&>video]:h-full [&>video]:w-full [&>video]:bg-grey-01 [&>video]:object-cover"
      />
    </DebateVideoTile>
  );
  const orderedVideoTiles =
    localParticipant?.position === false ? [remoteVideoTile, localVideoTile] : [localVideoTile, remoteVideoTile];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Debate recording"
      className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text"
    >
      {debateDebuggingEnabled && (
        <DebateDebugMenu
          debate={debate}
          countdown={countdown}
          roomState={roomState}
          audioMuted={audioMuted}
          remoteAudioEnabled={remoteAudioEnabled}
          videoEnabled={videoEnabled}
          onToggleAudioMuted={onToggleAudioMuted}
          onToggleRemoteAudioEnabled={onToggleRemoteAudioEnabled}
          onToggleVideoEnabled={onToggleVideoEnabled}
        />
      )}

      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center px-5 py-8">
        <h1 className="mb-5 max-w-[390px] text-center text-[1.375rem] leading-[1.1] font-semibold text-text">
          {debate.claim.claim}
        </h1>

        <div className="relative grid w-full gap-2">
          {orderedVideoTiles}

          {countdown.effectiveStatus === 'thanking' && rematchSession && (
            <DebateAgainCard
              opponentName={
                remoteRematchParticipant?.display_name || remoteRematchParticipant?.profile_space_id || 'Other debater'
              }
              localConsented={localConsented || rematchConsentRequested}
              remoteConsented={remoteConsented}
              busy={rematchBusy}
              onConsent={onRequestRematch}
            />
          )}
        </div>

        {roomState === 'reconnecting' && (
          <div className="mt-3 w-full rounded-lg border border-grey-02 bg-white px-4 py-3">
            <Text>Reconnecting to the debate room…</Text>
          </div>
        )}

        {roomError && (
          <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-red-01 bg-white px-4 py-3">
            <Text color="red-01">{roomError}</Text>
            {['thanking', 'complete'].includes(debate.status) && (
              <Button type="button" variant="tertiary" onClick={onRetryFinalization} disabled={roomState === 'saving'}>
                Retry save
              </Button>
            )}
            {debate.status === 'connecting' && (
              <Button type="button" variant="tertiary" onClick={onRetryConnection} disabled={roomState === 'saving'}>
                Retry connection
              </Button>
            )}
          </div>
        )}

        <div className="mt-5 flex w-full justify-end">
          <RecordingCircleButton
            ariaLabel={roomState === 'saving' ? 'Saving local recording' : 'Leave debate'}
            title={roomState === 'saving' ? 'Saving local recording' : 'Leave debate'}
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            <LeaveIcon />
          </RecordingCircleButton>
        </div>
      </main>
    </div>
  );
}

function DebateDebugMenu({
  debate,
  countdown,
  roomState,
  audioMuted,
  remoteAudioEnabled,
  videoEnabled,
  onToggleAudioMuted,
  onToggleRemoteAudioEnabled,
  onToggleVideoEnabled,
}: {
  debate: Debate;
  countdown: DebateCountdown;
  roomState: 'connecting' | 'reconnecting' | 'connected' | 'saving';
  audioMuted: boolean;
  remoteAudioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleRemoteAudioEnabled: () => void;
  onToggleVideoEnabled: () => void;
}) {
  const phases = debateDebugPhases(debate, countdown);

  return (
    <aside className="fixed top-4 right-4 z-[1010] w-[min(280px,calc(100vw-2rem))] rounded-lg border border-grey-02 bg-white/95 p-3 shadow-card backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <Text as="h2" variant="metadata" color="grey-04">
          Debate debugging
        </Text>
        <div className="flex items-center gap-2">
          <RecordingCircleButton
            ariaLabel={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            onClick={onToggleAudioMuted}
            disabled={roomState === 'saving'}
            active={audioMuted}
          >
            <MicrophoneIcon muted={audioMuted} />
          </RecordingCircleButton>
          <RecordingCircleButton
            ariaLabel={remoteAudioEnabled ? 'Disable audio' : 'Enable audio'}
            title={remoteAudioEnabled ? 'Disable audio' : 'Enable audio'}
            onClick={onToggleRemoteAudioEnabled}
            disabled={roomState === 'saving'}
            active={!remoteAudioEnabled}
          >
            <SpeakerIcon disabled={!remoteAudioEnabled} />
          </RecordingCircleButton>
          <RecordingCircleButton
            ariaLabel={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            onClick={onToggleVideoEnabled}
            disabled={roomState === 'saving'}
            active={!videoEnabled}
          >
            <CameraIcon disabled={!videoEnabled} />
          </RecordingCircleButton>
        </div>
      </div>

      <ol aria-label="Debate phases" className="mt-3 grid gap-1 border-t border-grey-02 pt-3">
        {phases.map(phase => (
          <li
            key={phase.id}
            aria-current={phase.current ? 'step' : undefined}
            className={cx(
              'flex min-h-8 items-center justify-between gap-3 rounded px-2.5 py-1.5 text-metadataMedium',
              phase.current ? 'bg-ctaPrimary text-white' : 'text-grey-04'
            )}
          >
            <span className="truncate">{phase.label}</span>
            {phase.duration && <span className="shrink-0 opacity-80">{phase.duration}</span>}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function debateDebugPhases(debate: Debate, countdown: DebateCountdown) {
  return [
    {
      id: 'connecting',
      label: 'Connecting',
      duration: null,
      current: countdown.effectiveStatus === 'connecting',
    },
    {
      id: 'preflight',
      label: 'Preflight',
      duration: null,
      current: countdown.effectiveStatus === 'preflight',
    },
    ...debate.turn_durations_ms.map((durationMs, index) => ({
      id: `turn-${index}`,
      label: `Timed turn ${index + 1}`,
      duration: formatDebugDuration(durationMs),
      current: countdown.effectiveStatus === 'in_progress' && countdown.turnIndex === index,
    })),
    {
      id: 'thanking',
      label: 'Thanking',
      duration: null,
      current: countdown.effectiveStatus === 'thanking',
    },
  ];
}

function formatDebugDuration(durationMs: number) {
  const seconds = Math.max(0, Math.round(durationMs / 1_000));
  if (seconds > 0 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function DebateVideoTile({
  participantPosition,
  active,
  overlayText,
  upcomingSeconds,
  upcomingLabel = "You're up in",
  showGo = false,
  showWrapItUp = false,
  showDebateEndsSoon = false,
  inactive = false,
  revealInactive = false,
  inactiveOverlayId,
  countdown,
  closingMessage = false,
  children,
}: {
  participantPosition: boolean | null;
  active: boolean;
  overlayText?: string | null;
  upcomingSeconds?: number | null;
  upcomingLabel?: string;
  showGo?: boolean;
  showWrapItUp?: boolean;
  showDebateEndsSoon?: boolean;
  inactive?: boolean;
  revealInactive?: boolean;
  inactiveOverlayId: 'local' | 'remote';
  countdown?: React.ReactNode;
  closingMessage?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-debate-video-position={participantPosition === null ? undefined : participantPosition ? 'yes' : 'no'}
      className="relative aspect-[5/3] min-h-0 overflow-hidden rounded-lg bg-black shadow-card"
    >
      <div className="absolute inset-0 z-0">{children}</div>
      {active && <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-white/80 ring-inset" />}
      <div
        aria-hidden="true"
        data-inactive-speaker={inactiveOverlayId}
        data-visible={inactive && !revealInactive ? 'true' : 'false'}
        className={cx(
          'pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/45 transition-opacity duration-700 ease-out',
          inactive && !revealInactive ? 'opacity-100' : 'opacity-0'
        )}
      >
        <MutedMicrophoneIndicator />
      </div>
      {countdown && <div className="pointer-events-none absolute top-3 right-3 z-20">{countdown}</div>}

      {closingMessage && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Nice debate!
          <br />
          Say thanks
        </div>
      )}

      {upcomingSeconds !== null && upcomingSeconds !== undefined && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center text-center">
          <div className="text-recordingLabel text-text" style={recordingLabelTextShadow}>
            {upcomingLabel}
          </div>
          <div className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white" style={recordingOverlayTextShadow}>
            {upcomingSeconds}
          </div>
        </div>
      )}

      {showGo && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center text-center text-[7.5rem] leading-none font-bold text-white"
          style={recordingOverlayTextShadow}
        >
          GO!
        </div>
      )}

      {showWrapItUp && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Wrap it up!
        </div>
      )}

      {showDebateEndsSoon && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Debate ends soon
        </div>
      )}

      {overlayText && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Text
            color="white"
            variant="bodySemibold"
            className="rounded-full border border-white/40 bg-black/70 px-4 py-2 shadow-light"
          >
            {overlayText}
          </Text>
        </div>
      )}
    </section>
  );
}

function participantIsInactive(
  effectiveStatus: Debate['status'],
  participantSlot: ParticipantSlot | null,
  activeSlot: ParticipantSlot | null
) {
  if (!participantSlot || effectiveStatus === 'thanking' || effectiveStatus === 'complete') return false;
  if (effectiveStatus === 'in_progress') return activeSlot !== participantSlot;
  return effectiveStatus === 'connecting' || effectiveStatus === 'preflight';
}

function localTurnGoIsVisible(countdown: DebateCountdown, localSlot: ParticipantSlot | null) {
  return (
    countdown.effectiveStatus === 'in_progress' &&
    localSlot !== null &&
    countdown.activeSlot === localSlot &&
    countdown.elapsedMs < 2_000
  );
}

function wrapItUpIsVisible(countdown: DebateCountdown, slot: ParticipantSlot | null) {
  return (
    countdown.effectiveStatus === 'in_progress' &&
    slot !== null &&
    countdown.activeSlot === slot &&
    countdown.remainingSeconds > 0 &&
    countdown.remainingSeconds <= 5
  );
}

function upcomingTurnIsRebuttal(debate: Debate, countdown: DebateCountdown) {
  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return false;
  const nextTurnIndex = countdown.turnIndex + 1;
  const turnCount = debate.turn_durations_ms.length;
  if (nextTurnIndex >= turnCount) return false;
  // Mirror format-details.tsx: round 0 is always an opening argument, so a turn is a
  // rebuttal only when it falls in the last round and that round is not the opening one.
  const roundIndex = Math.floor(nextTurnIndex / 2);
  return roundIndex !== 0 && roundIndex === Math.floor((turnCount - 1) / 2);
}

function debateEndsSoonIsVisible(debate: Debate, countdown: DebateCountdown, localSlot: ParticipantSlot | null) {
  if (!localSlot || countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return false;
  if (countdown.activeSlot === localSlot) return false;
  if (countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return false;
  return countdown.turnIndex === debate.turn_durations_ms.length - 1;
}

function thankingParticipantSlot(debate: Debate, countdown: DebateCountdown): ParticipantSlot | null {
  if (countdown.effectiveStatus !== 'thanking') return null;
  if (countdown.progress < 0.5) return debate.first_participant_slot;
  return debate.first_participant_slot === 1 ? 2 : 1;
}

function DebateRecordingRemovedDialog({
  cancellerName,
  claim,
  onAcknowledge,
}: {
  cancellerName: string;
  claim: string;
  onAcknowledge: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/40 px-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your debate was removed"
        className="w-full max-w-[360px] rounded-xl bg-white p-5 text-center text-text shadow-card"
      >
        <Text as="h2" variant="smallTitle" color="text">
          Your debate was removed
        </Text>
        <Text as="p" variant="metadata" color="grey-04" className="mt-2">
          {cancellerName} cancelled the upload of your debate
        </Text>
        <div className="mt-4 rounded-lg bg-grey-01 px-4 py-3">
          <Text as="p" variant="metadata" color="grey-04" className="line-clamp-3">
            {claim}
          </Text>
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onAcknowledge}
            className="min-h-7 rounded-full bg-text px-3 text-metadata text-white transition-colors hover:bg-text/90"
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}

function DebateAgainCard({
  opponentName,
  localConsented,
  remoteConsented,
  busy,
  onConsent,
}: {
  opponentName: string;
  localConsented: boolean;
  remoteConsented: boolean;
  busy: boolean;
  onConsent: () => void;
}) {
  return (
    <section className="absolute top-1/2 left-1/2 z-40 flex w-[calc(100%-7rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-hidden rounded-lg bg-white px-3 py-2 text-text shadow-card">
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <Text as="span" variant="smallTitle" color="text">
          Debate again?
        </Text>
        <button
          type="button"
          onClick={onConsent}
          disabled={busy || localConsented}
          className={cx(
            'min-h-7 rounded-full px-3 text-metadata text-white transition-colors disabled:cursor-default',
            localConsented ? 'bg-text' : 'bg-text hover:bg-text/90'
          )}
        >
          {localConsented ? 'Waiting...' : busy ? 'Saving...' : 'Yes'}
        </button>
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2.5">
        <Text as="span" variant="smallTitle" color="text" className="min-w-0 truncate">
          {opponentName}
        </Text>
        <span
          className={cx(
            'inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-metadata',
            remoteConsented ? 'bg-green text-text' : 'bg-grey-01 text-grey-04'
          )}
        >
          {remoteConsented && <Check />}
          {remoteConsented ? 'Ready' : 'Waiting...'}
        </span>
      </div>
    </section>
  );
}

function RecordingCountdownRing({ countdown }: { countdown: DebateCountdown }) {
  const remainingRatio = Math.max(0, Math.min(1, 1 - countdown.progress));
  const danger =
    countdown.effectiveStatus === 'in_progress' &&
    countdown.activeSlot !== null &&
    countdown.remainingSeconds > 0 &&
    countdown.remainingSeconds <= 5;
  const ringColor = danger ? 'var(--color-red-01)' : 'var(--color-white)';
  const dashOffset = recordingCountdownCircumference * (1 - remainingRatio);

  return (
    <div
      aria-label={`Phase timer: ${countdown.remainingSeconds} seconds remaining`}
      className="relative grid place-items-center"
      style={{ width: recordingCountdownRenderSize, height: recordingCountdownRenderSize }}
    >
      <svg
        viewBox={`0 0 ${recordingCountdownSize} ${recordingCountdownSize}`}
        aria-hidden="true"
        className="absolute inset-0 size-full"
      >
        <circle cx="34" cy="34" r="32" fill="rgba(16,16,16,0.34)" stroke="rgba(16,16,16,0.64)" strokeWidth="5" />
        <circle cx="34" cy="34" r="20" fill="rgba(0,0,0,0.52)" />
        <circle
          cx="34"
          cy="34"
          r={recordingCountdownRadius}
          fill="none"
          stroke="rgba(119,119,119,0.88)"
          strokeWidth="6"
        />
        <circle
          cx="34"
          cy="34"
          r={recordingCountdownRadius}
          fill="none"
          stroke={ringColor}
          strokeWidth="7"
          strokeLinecap="butt"
          strokeDasharray={recordingCountdownCircumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <span className="relative z-10 text-[1.625rem] leading-none font-medium text-white">
        {countdown.remainingSeconds}
      </span>
    </div>
  );
}

function RecordingCircleButton({
  ariaLabel,
  title,
  onClick,
  disabled,
  active = false,
  className,
  children,
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'grid size-10 place-items-center rounded-full border border-grey-02 bg-white text-text shadow-light transition disabled:opacity-50',
        active && 'bg-bg',
        className
      )}
    >
      {children}
    </button>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M13 12H3" />
      <path d="M6 9l-3 3 3 3" />
    </svg>
  );
}

function MicrophoneIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 14a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Z" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
      {muted && <path d="M4 4l16 16" />}
    </svg>
  );
}

function MutedMicrophoneIndicator() {
  return (
    <svg
      width="45"
      height="45"
      viewBox="0 0 45 45"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-muted-indicator="true"
      className="size-[45px]"
    >
      <rect width="45" height="44.9989" rx="22.4994" fill="white" />
      <rect x="17.6431" y="12.2852" width="9.71429" height="17.75" rx="4.85714" stroke="#151515" />
      <path
        d="M14.4644 24.1055V25.1769C14.4644 29.6149 18.0621 33.2126 22.5001 33.2126C26.9381 33.2126 30.5358 29.6149 30.5358 25.1769V24.1055"
        stroke="#151515"
        strokeLinecap="round"
      />
      <path d="M27.3216 16.6094L17.6787 25.7165" stroke="#151515" />
    </svg>
  );
}

function CameraIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M16 10l5-3v10l-5-3" />
      {disabled && <path d="M3 3l18 18" />}
    </svg>
  );
}

function SpeakerIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9.5a4 4 0 0 1 0 5" />
      <path d="M19 7a8 8 0 0 1 0 10" />
      {disabled && <path d="M3 3l18 18" />}
    </svg>
  );
}

function setLocalTrackPreferences(
  tracks: LocalTrackLike[],
  preferences: { audioEnabled: boolean; videoEnabled: boolean }
) {
  for (const track of tracks) {
    if (track.mediaStreamTrack.kind === 'audio') {
      track.mediaStreamTrack.enabled = preferences.audioEnabled;
    }
    if (track.mediaStreamTrack.kind === 'video') {
      track.mediaStreamTrack.enabled = preferences.videoEnabled;
    }
  }
}

function setRemoteMediaAudioEnabled(
  remoteMediaRef: React.RefObject<HTMLDivElement | null>,
  remoteAudioEnabled: boolean
) {
  for (const element of remoteMediaRef.current?.querySelectorAll('audio, video') ?? []) {
    if (element instanceof HTMLMediaElement) {
      element.muted = !remoteAudioEnabled;
    }
  }
}

function shouldEnableLocalAudio(
  effectiveStatus: Debate['status'] | null,
  activeSlot: ParticipantSlot | null,
  localSlot: ParticipantSlot | null,
  audioMuted: boolean
) {
  if (audioMuted || !effectiveStatus || !localSlot) return false;
  if (effectiveStatus === 'thanking') return true;
  return effectiveStatus === 'in_progress' && activeSlot === localSlot;
}

function localTurnStartsInSeconds(
  debate: Debate,
  countdown: DebateCountdown,
  localSlot: ParticipantSlot | null
): number | null {
  if (!localSlot || countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return null;

  if (countdown.effectiveStatus === 'preflight') {
    return countdown.activeSlot === localSlot ? countdown.remainingSeconds : null;
  }

  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return null;
  if (countdown.activeSlot === localSlot) return null;

  const nextTurnIndex = countdown.turnIndex + 1;
  if (nextTurnIndex >= debate.turn_durations_ms.length) return null;

  return participantSlotForTurn(debate.first_participant_slot, nextTurnIndex) === localSlot
    ? countdown.remainingSeconds
    : null;
}

function participantSlotForTurn(firstParticipantSlot: ParticipantSlot, turnIndex: number): ParticipantSlot {
  if (turnIndex % 2 === 0) return firstParticipantSlot;
  return firstParticipantSlot === 1 ? 2 : 1;
}

function stopLocalTracks(localTracksRef: React.MutableRefObject<LocalTrackLike[]>) {
  stopTracks(localTracksRef.current);
  localTracksRef.current = [];
}

function stopTracks(tracks: LocalTrackLike[]) {
  for (const track of tracks) {
    track.detach?.();
    track.stop();
  }
}

// Mobile browsers behind cellular/symmetric NAT can take several seconds to establish the publisher
// PeerConnection, and the first publishTrack often rejects with "engine not connected within
// timeout" before ICE settles. Retry a couple times so a slow-but-viable connection isn't surfaced
// as a hard failure that drops the debater from the call.
async function publishTrackWithRetry(room: RoomLike, track: LocalTrackLike, isCurrent: () => boolean) {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      await room.localParticipant.publishTrack(track);
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isCurrent()) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
}

function disconnectRoom(
  roomRef: React.MutableRefObject<RoomLike | null>,
  localTracksRef: React.MutableRefObject<LocalTrackLike[]>,
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  remoteMediaRef: React.RefObject<HTMLDivElement | null>
) {
  stopLocalTracks(localTracksRef);
  roomRef.current?.disconnect();
  roomRef.current = null;
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = null;
  }
  if (remoteMediaRef.current) {
    remoteMediaRef.current.replaceChildren();
  }
}

function useDebateCountdown(debate: Debate | null, serverNow: () => number): DebateCountdown {
  const [now, setNow] = React.useState(serverNow);

  React.useEffect(() => {
    setNow(serverNow());
    const timer = window.setInterval(() => setNow(serverNow()), 500);
    return () => window.clearInterval(timer);
  }, [serverNow]);

  const countdownWindow = debate ? countdownWindowForDebate(debate, now) : null;
  if (!countdownWindow || countdownWindow.targetMs === null) {
    return {
      label: '00:00',
      remainingSeconds: 0,
      progress: 0,
      activeSlot: countdownWindow?.activeSlot ?? null,
      effectiveStatus: countdownWindow?.effectiveStatus ?? debate?.status ?? 'ready',
      turnIndex: countdownWindow?.turnIndex ?? null,
      elapsedMs: 0,
    };
  }

  const targetMs = countdownWindow.targetMs;
  const startMs = countdownWindow.startMs;
  const remainingMs = Math.max(0, targetMs - now);
  const seconds = Math.ceil(remainingMs / 1_000);
  const totalMs = startMs !== null ? Math.max(1, targetMs - startMs) : 0;
  const elapsedMs = startMs !== null ? Math.min(totalMs, Math.max(0, now - startMs)) : 0;

  return {
    label: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    remainingSeconds: seconds,
    progress: totalMs === 0 ? 0 : elapsedMs / totalMs,
    activeSlot: countdownWindow.activeSlot,
    effectiveStatus: countdownWindow.effectiveStatus,
    turnIndex: countdownWindow.turnIndex,
    elapsedMs,
  };
}

function recordingWindowForDebate(debate: Debate): DebateRecordingWindow | null {
  const startAtMs = timestampMs(debate.started_at ?? debate.preflight_ends_at);
  const durationMs = debate.turn_durations_ms.reduce((sum, durationMs) => sum + Math.max(0, durationMs), 0);
  if (startAtMs === null || durationMs <= 0) return null;

  return {
    startAtMs,
    endAtMs: startAtMs + durationMs,
  };
}

function countdownWindowForDebate(
  debate: Debate,
  now: number
): {
  startMs: number | null;
  targetMs: number | null;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
} {
  if (debate.status === 'connecting') {
    return {
      startMs: null,
      targetMs: null,
      activeSlot: null,
      effectiveStatus: 'connecting',
      turnIndex: null,
    };
  }

  if (debate.status === 'preflight') {
    const debateStartMs = timestampMs(debate.preflight_ends_at);
    if (debateStartMs !== null && now >= debateStartMs) {
      return timedDebateCountdownWindow(debate, debateStartMs, now);
    }
    return {
      startMs: debateStartMs === null ? null : debateStartMs - debatePreflightDurationMs,
      targetMs: debateStartMs,
      activeSlot: debate.first_participant_slot,
      effectiveStatus: 'preflight',
      turnIndex: null,
    };
  }

  if (debate.status === 'in_progress') {
    const debateStartMs = timestampMs(debate.started_at ?? debate.preflight_ends_at);
    if (debateStartMs !== null) {
      return timedDebateCountdownWindow(debate, debateStartMs, now);
    }
    return {
      startMs: timestampMs(debate.turn_started_at),
      targetMs: timestampMs(debate.turn_ends_at),
      activeSlot: debate.current_speaker_slot,
      effectiveStatus: 'in_progress',
      turnIndex: debate.current_turn_index,
    };
  }

  if (debate.status === 'thanking') {
    return {
      startMs: timestampMs(debate.turn_started_at),
      targetMs: timestampMs(debate.turn_ends_at),
      activeSlot: null,
      effectiveStatus: 'thanking',
      turnIndex: null,
    };
  }

  return {
    startMs: null,
    targetMs: null,
    activeSlot: null,
    effectiveStatus: debate.status,
    turnIndex: null,
  };
}

function timedDebateCountdownWindow(
  debate: Debate,
  debateStartMs: number,
  now: number
): {
  startMs: number;
  targetMs: number;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
} {
  let turnStartMs = debateStartMs;

  for (const [turnIndex, configuredDurationMs] of debate.turn_durations_ms.entries()) {
    const turnEndMs = turnStartMs + Math.max(0, configuredDurationMs);
    if (now < turnEndMs) {
      return {
        startMs: turnStartMs,
        targetMs: turnEndMs,
        activeSlot: participantSlotForTurn(debate.first_participant_slot, turnIndex),
        effectiveStatus: 'in_progress',
        turnIndex,
      };
    }
    turnStartMs = turnEndMs;
  }

  return {
    startMs: turnStartMs,
    targetMs: turnStartMs + debateThankingDurationMs,
    activeSlot: null,
    effectiveStatus: 'thanking',
    turnIndex: null,
  };
}

function speakerStatus(debate: Debate) {
  if (debate.status === 'connecting') return 'Connecting both speakers.';
  if (debate.status === 'preflight') return 'Get ready. The first turn is about to start.';
  if (debate.status === 'in_progress' && debate.current_speaker_slot) {
    return `${labelForSlot(debate, debate.current_speaker_slot)} is speaking.`;
  }
  if (debate.status === 'thanking') return 'Wrap-up is running. Both speakers can thank each other.';
  if (debate.status === 'complete') return 'Debate complete.';
  if (debate.status === 'cancelled') return 'Debate cancelled.';
  return 'Waiting for both speakers to join.';
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function labelForSlot(debate: Debate, slot: ParticipantSlot) {
  return debate.participants.find(participant => participant.participant_slot === slot)?.position_label ?? 'Position';
}

function speakerName(participant: Pick<Debate['participants'][number], 'display_name' | 'profile_space_id'>) {
  return participant.display_name || participant.profile_space_id;
}

function timestampMs(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}
