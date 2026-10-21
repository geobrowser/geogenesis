'use client';

import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import * as React from 'react';

import {
  type MediaDeviceOption,
  authorizeAudioOutput,
  systemDefaultAudioOutput,
  toMediaDeviceOptions,
} from '~/core/media/device-options';
import {
  availableMediaDeviceId,
  availableMediaInputId,
  readMediaDevicePreference,
  rememberMediaDevice,
  subscribeMediaDevicePreferences,
} from '~/core/media/device-preferences';

import type { DebateJoinChoice } from './request-join-state';

export { systemDefaultAudioOutput } from '~/core/media/device-options';
export type { MediaDeviceOption } from '~/core/media/device-options';

export type PreJoinMediaState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

export type LocalTrackLike = {
  mediaStreamTrack: MediaStreamTrack;
  setProcessor?: (processor: KrispNoiseFilterProcessor) => Promise<void>;
  stopProcessor?: () => Promise<void>;
  stop: () => void;
  detach?: () => void;
};

export type DebateMediaSession = {
  activeSessionKey: string | null;
  previewState: PreJoinMediaState;
  previewBusy: boolean;
  previewError: string | null;
  previewStream: MediaStream | null;
  audioInputDevices: MediaDeviceOption[];
  audioOutputDevices: MediaDeviceOption[];
  videoInputDevices: MediaDeviceOption[];
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  selectedVideoInputId: string;
  audioOutputSupported: boolean;
  audioOutputError: string | null;
  localTracksRef: React.MutableRefObject<LocalTrackLike[]>;
  localMediaStreamRef: React.MutableRefObject<MediaStream | null>;
  selectedAudioInputIdRef: React.MutableRefObject<string>;
  selectedAudioOutputIdRef: React.MutableRefObject<string>;
  selectedVideoInputIdRef: React.MutableRefObject<string>;
  audioOutputSupportedRef: React.MutableRefObject<boolean>;
  audioOutputSelectionPromiseRef: React.MutableRefObject<Promise<void> | null>;
  /**
   * What the card holding this session shows the person joining with, for the room it is handed to.
   * Kept through `promoteSession`, cleared by `beginSession`.
   */
  joinChoiceRef: React.MutableRefObject<DebateJoinChoice | null>;
  beginSession: (sessionKey: string) => void;
  promoteSession: (fromSessionKey: string, toSessionKey: string) => void;
  releaseSession: (sessionKey: string) => void;
  stopMedia: () => void;
  setPreviewStream: (stream: MediaStream | null) => void;
  ensurePreview: (options?: {
    forceRestart?: boolean;
    audioInputId?: string;
    videoInputId?: string;
    audio?: boolean;
    video?: boolean;
  }) => Promise<LocalTrackLike[]>;
  changeAudioInput: (deviceId: string) => void;
  changeAudioOutput: (deviceId: string, apply?: (authorizedDeviceId: string) => Promise<unknown>) => Promise<void>;
  /**
   * Report that audio could not be routed to the selected speaker. `changeAudioOutput` handles the
   * picker's own failures; this is for the caller that owns a live room, where the route is applied
   * while connecting or restoring devices. Explicit selections pass a routing callback to
   * `changeAudioOutput`, which saves only after that callback succeeds.
   */
  /** `null` clears the reported failure, so a successful retry can take the notice back. */
  reportAudioOutputFailure: (message: string | null) => void;
  changeVideoInput: (deviceId: string) => void;
};

const DebateMediaSessionContext = React.createContext<DebateMediaSession | null>(null);

export function DebateMediaSessionProvider({ children }: { children: React.ReactNode }) {
  const [activeSessionKey, setActiveSessionKey] = React.useState<string | null>(null);
  const [previewState, setPreviewState] = React.useState<PreJoinMediaState>('requesting');
  const [previewBusy, setPreviewBusy] = React.useState(true);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewStream, setPreviewStreamState] = React.useState<MediaStream | null>(null);
  const [audioInputDevices, setAudioInputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = React.useState<MediaDeviceOption[]>([systemDefaultAudioOutput]);
  const [videoInputDevices, setVideoInputDevices] = React.useState<MediaDeviceOption[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = React.useState('');
  const [selectedAudioOutputId, setSelectedAudioOutputId] = React.useState(systemDefaultAudioOutput.deviceId);
  const [selectedVideoInputId, setSelectedVideoInputId] = React.useState('');
  const [audioOutputSupported, setAudioOutputSupported] = React.useState(false);
  const [audioOutputError, setAudioOutputError] = React.useState<string | null>(null);
  const activeSessionKeyRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  const previewGenerationRef = React.useRef(0);
  const mediaDeviceRefreshGenerationRef = React.useRef(0);
  const audioOutputSelectionGenerationRef = React.useRef(0);
  const localTracksRef = React.useRef<LocalTrackLike[]>([]);
  const localMediaStreamRef = React.useRef<MediaStream | null>(null);
  const localPreviewPromiseRef = React.useRef<Promise<LocalTrackLike[]> | null>(null);
  const joinChoiceRef = React.useRef<DebateJoinChoice | null>(null);
  /** What the in-flight acquisition asked for, so a call wanting something else is not handed it. */
  const localPreviewWantRef = React.useRef<{ audio: boolean; video: boolean } | null>(null);
  /**
   * The kinds this session last asked for, so a restart that names none asks for the same again.
   *
   * A restart from inside here — a device change, or picking a different microphone — carries device
   * ids and no kinds, and defaulting those to "both" reopened a camera the card had been told to
   * leave off: the light came on, the card went on saying the camera was off, and the room then
   * inherited a track nobody chose. Reset per session, because a surface that has asked for nothing
   * yet does want both.
   */
  const wantedKindsRef = React.useRef({ audio: true, video: true });
  const audioOutputSelectionPromiseRef = React.useRef<Promise<void> | null>(null);
  const audioOutputRoutingPromiseRef = React.useRef<Promise<void> | null>(null);
  const selectedAudioInputIdRef = React.useRef('');
  const selectedAudioOutputIdRef = React.useRef(systemDefaultAudioOutput.deviceId);
  const selectedVideoInputIdRef = React.useRef('');
  const audioOutputSupportedRef = React.useRef(false);
  const audioOutputSelectionFailedRef = React.useRef(false);

  const stopMedia = React.useCallback(() => {
    previewGenerationRef.current += 1;
    audioOutputSelectionGenerationRef.current += 1;
    stopTracks(localTracksRef.current);
    localTracksRef.current = [];
    localMediaStreamRef.current = null;
    localPreviewPromiseRef.current = null;
    localPreviewWantRef.current = null;
    audioOutputSelectionPromiseRef.current = null;
    audioOutputRoutingPromiseRef.current = null;
    setPreviewStreamState(null);
    setPreviewState('requesting');
    setPreviewBusy(true);
    setPreviewError(null);
  }, []);

  const beginSession = React.useCallback(
    (sessionKey: string) => {
      if (activeSessionKeyRef.current === sessionKey) return;
      stopMedia();
      selectedAudioInputIdRef.current = readMediaDevicePreference('audioinput') ?? selectedAudioInputIdRef.current;
      selectedVideoInputIdRef.current = readMediaDevicePreference('videoinput') ?? selectedVideoInputIdRef.current;
      selectedAudioOutputIdRef.current = readMediaDevicePreference('audiooutput') ?? selectedAudioOutputIdRef.current;
      setSelectedAudioInputId(selectedAudioInputIdRef.current);
      setSelectedVideoInputId(selectedVideoInputIdRef.current);
      setSelectedAudioOutputId(selectedAudioOutputIdRef.current);
      // A new surface has chosen nothing yet. `promoteSession` deliberately leaves this alone: a
      // hand-off keeps the choice the card made.
      wantedKindsRef.current = { audio: true, video: true };
      joinChoiceRef.current = null;
      audioOutputSelectionFailedRef.current = false;
      setAudioOutputError(null);
      activeSessionKeyRef.current = sessionKey;
      setActiveSessionKey(sessionKey);
    },
    [stopMedia]
  );

  const promoteSession = React.useCallback((fromSessionKey: string, toSessionKey: string) => {
    if (activeSessionKeyRef.current !== fromSessionKey && activeSessionKeyRef.current !== toSessionKey) return;
    activeSessionKeyRef.current = toSessionKey;
    setActiveSessionKey(toSessionKey);
  }, []);

  const releaseSession = React.useCallback(
    (sessionKey: string) => {
      if (activeSessionKeyRef.current !== sessionKey) return;
      activeSessionKeyRef.current = null;
      setActiveSessionKey(null);
      stopMedia();
    },
    [stopMedia]
  );

  const setPreviewStream = React.useCallback((stream: MediaStream | null) => {
    localMediaStreamRef.current = stream;
    setPreviewStreamState(stream);
  }, []);

  const refreshMediaDevices = React.useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices || !activeSessionKeyRef.current) return;
    const generation = mediaDeviceRefreshGenerationRef.current + 1;
    mediaDeviceRefreshGenerationRef.current = generation;
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!mountedRef.current || !activeSessionKeyRef.current || mediaDeviceRefreshGenerationRef.current !== generation) {
      return;
    }
    const audioInputs = toMediaDeviceOptions(devices.filter(device => device.kind === 'audioinput'));
    const audioOutputs = audioOutputSupportedRef.current
      ? toMediaDeviceOptions(devices.filter(device => device.kind === 'audiooutput'))
      : [systemDefaultAudioOutput];
    const videoInputs = toMediaDeviceOptions(devices.filter(device => device.kind === 'videoinput'));

    const availableOutputs = audioOutputs.length > 0 ? audioOutputs : [systemDefaultAudioOutput];
    setAudioInputDevices(current => (sameMediaDeviceOptions(current, audioInputs) ? current : audioInputs));
    setAudioOutputDevices(current => (sameMediaDeviceOptions(current, availableOutputs) ? current : availableOutputs));
    setVideoInputDevices(current => (sameMediaDeviceOptions(current, videoInputs) ? current : videoInputs));
    const nextAudioInputId = availableMediaInputId(
      readMediaDevicePreference('audioinput') ?? selectedAudioInputIdRef.current,
      devices.filter(device => device.kind === 'audioinput')
    );
    const nextAudioOutputId = availableMediaDeviceId(
      readMediaDevicePreference('audiooutput') ?? selectedAudioOutputIdRef.current,
      availableOutputs
    );
    const nextVideoInputId = availableMediaInputId(
      readMediaDevicePreference('videoinput') ?? selectedVideoInputIdRef.current,
      devices.filter(device => device.kind === 'videoinput')
    );

    selectedAudioInputIdRef.current = nextAudioInputId;
    selectedAudioOutputIdRef.current = nextAudioOutputId;
    selectedVideoInputIdRef.current = nextVideoInputId;
    setSelectedAudioInputId(nextAudioInputId);
    setSelectedAudioOutputId(nextAudioOutputId);
    setSelectedVideoInputId(nextVideoInputId);

    return { audioInputId: nextAudioInputId, videoInputId: nextVideoInputId };
  }, []);

  const ensurePreview = React.useCallback(
    async (
      options: {
        forceRestart?: boolean;
        audioInputId?: string;
        videoInputId?: string;
        audio?: boolean;
        video?: boolean;
      } = {}
    ) => {
      if (!activeSessionKeyRef.current) return [];
      const wantAudio = options.audio ?? wantedKindsRef.current.audio;
      const wantVideo = options.video ?? wantedKindsRef.current.video;
      wantedKindsRef.current = { audio: wantAudio, video: wantVideo };

      if (localPreviewPromiseRef.current) {
        const inFlight = localPreviewWantRef.current;
        const sameKinds = inFlight !== null && inFlight.audio === wantAudio && inFlight.video === wantVideo;
        if (!options.forceRestart && sameKinds) return localPreviewPromiseRef.current;
        await localPreviewPromiseRef.current.catch(() => undefined);
        if (!activeSessionKeyRef.current) return [];
      }

      const liveKinds = new Set(localTracksRef.current.map(track => track.mediaStreamTrack.kind));
      const hasLivePreview = localTracksRef.current.length > 0 && localMediaStreamRef.current !== null;
      const haveEveryWantedKind = (!wantAudio || liveKinds.has('audio')) && (!wantVideo || liveKinds.has('video'));

      const hasUnwantedKind = (!wantAudio && liveKinds.has('audio')) || (!wantVideo && liveKinds.has('video'));
      if (!options.forceRestart && hasLivePreview && haveEveryWantedKind && !hasUnwantedKind) {
        setPreviewStreamState(localMediaStreamRef.current);
        setPreviewState('ready');
        setPreviewBusy(false);
        return localTracksRef.current;
      }

      const opening = {
        audio: wantAudio && (Boolean(options.forceRestart) || !liveKinds.has('audio')),
        video: wantVideo && (Boolean(options.forceRestart) || !liveKinds.has('video')),
      };
      const keep = localTracksRef.current.filter(track => {
        const kind = track.mediaStreamTrack.kind;
        if (kind === 'audio') return wantAudio && !opening.audio;
        if (kind === 'video') return wantVideo && !opening.video;
        return false;
      });
      setPreviewError(null);
      setPreviewBusy(true);

      if (!hasLivePreview) setPreviewState('requesting');
      const generation = previewGenerationRef.current + 1;
      previewGenerationRef.current = generation;
      const isCurrent = () => mountedRef.current && previewGenerationRef.current === generation;
      const previewPromise = (async () => {
        const livekit = await import('livekit-client');
        if (!isCurrent()) return [];
        const supportsOutput =
          !audioOutputSelectionFailedRef.current &&
          typeof livekit.supportsAudioOutputSelection === 'function' &&
          livekit.supportsAudioOutputSelection();
        audioOutputSupportedRef.current = supportsOutput;
        setAudioOutputSupported(supportsOutput);
        if (!supportsOutput) {
          selectedAudioOutputIdRef.current = systemDefaultAudioOutput.deviceId;
          setSelectedAudioOutputId(systemDefaultAudioOutput.deviceId);
          setAudioOutputDevices([systemDefaultAudioOutput]);
        }
        stopTracks(localTracksRef.current.filter(track => !keep.includes(track)));
        localTracksRef.current = keep;
        if (keep.length === 0) localMediaStreamRef.current = null;
        if (!hasLivePreview) setPreviewStreamState(null);
        const audioInputId = options.audioInputId ?? selectedAudioInputIdRef.current;
        const videoInputId = options.videoInputId ?? selectedVideoInputIdRef.current;
        const opened =
          opening.audio || opening.video
            ? ((await livekit.createLocalTracks({
                audio: opening.audio ? (audioInputId ? { deviceId: audioInputId } : true) : false,
                video: opening.video ? (videoInputId ? { deviceId: videoInputId } : true) : false,
              })) as LocalTrackLike[])
            : [];
        if (!isCurrent()) {
          stopTracks(opened);
          return [];
        }

        if (
          (opening.audio && !opened.some(track => track.mediaStreamTrack.kind === 'audio')) ||
          (opening.video && !opened.some(track => track.mediaStreamTrack.kind === 'video'))
        ) {
          stopTracks(opened);
          throw Object.assign(new Error('Required media tracks are unavailable.'), { name: 'NotFoundError' });
        }
        const tracks = [...keep, ...opened];
        localTracksRef.current = tracks;

        if (tracks.length === 0) {
          localMediaStreamRef.current = null;
          setPreviewStreamState(null);
          await refreshMediaDevices();
          if (!isCurrent()) return [];
          setPreviewState('idle');
          setPreviewBusy(false);
          return tracks;
        }
        const stream = new MediaStream(tracks.map(track => track.mediaStreamTrack));
        localMediaStreamRef.current = stream;
        setPreviewStreamState(stream);
        await refreshMediaDevices();
        if (!isCurrent()) {
          stopTracks(localTracksRef.current);
          localTracksRef.current = [];
          localMediaStreamRef.current = null;
          setPreviewStreamState(null);
          return [];
        }
        setPreviewState('ready');
        setPreviewBusy(false);
        return tracks;
      })();
      localPreviewPromiseRef.current = previewPromise;
      localPreviewWantRef.current = { audio: wantAudio, video: wantVideo };
      try {
        return await previewPromise;
      } catch (error) {
        if (isCurrent()) {
          stopTracks(localTracksRef.current.filter(track => !keep.includes(track)));
          localTracksRef.current = keep;
          // A later restart with no kinds named reopens what is live, not the kind that just failed.
          if (keep.length > 0) {
            wantedKindsRef.current = {
              audio: keep.some(track => track.mediaStreamTrack.kind === 'audio'),
              video: keep.some(track => track.mediaStreamTrack.kind === 'video'),
            };
          }
          // The same stream when it already holds exactly what was kept, so a room publishing it
          // does not read the failure as a new device and reconnect.
          const current = localMediaStreamRef.current;
          const unchanged =
            current !== null &&
            current.getTracks().length === keep.length &&
            keep.every(track => current.getTracks().includes(track.mediaStreamTrack));
          const kept =
            keep.length === 0 ? null : unchanged ? current : new MediaStream(keep.map(track => track.mediaStreamTrack));
          localMediaStreamRef.current = kept;
          setPreviewStreamState(kept);
          const failure = preJoinMediaFailure(error);
          setPreviewError(failure.message);
          setPreviewState(failure.state);
          setPreviewBusy(false);
        }
        throw error;
      } finally {
        if (localPreviewPromiseRef.current === previewPromise) {
          localPreviewPromiseRef.current = null;
          localPreviewWantRef.current = null;
        }
      }
    },
    [refreshMediaDevices]
  );

  const changeAudioInput = React.useCallback(
    (deviceId: string) => {
      selectedAudioInputIdRef.current = deviceId;
      setSelectedAudioInputId(deviceId);
      rememberMediaDevice('audioinput', deviceId);
      void ensurePreview({
        forceRestart: true,
        audioInputId: deviceId,
        videoInputId: selectedVideoInputIdRef.current,
      }).catch(() => undefined);
    },
    [ensurePreview]
  );

  const changeVideoInput = React.useCallback(
    (deviceId: string) => {
      selectedVideoInputIdRef.current = deviceId;
      setSelectedVideoInputId(deviceId);
      rememberMediaDevice('videoinput', deviceId);
      void ensurePreview({
        forceRestart: true,
        audioInputId: selectedAudioInputIdRef.current,
        videoInputId: deviceId,
      }).catch(() => undefined);
    },
    [ensurePreview]
  );

  const reportAudioOutputFailure = React.useCallback((message: string | null) => {
    setAudioOutputError(message);
  }, []);

  const changeAudioOutput = React.useCallback(async (deviceId: string, apply?: (id: string) => Promise<unknown>) => {
    // `ensurePreview` is what normally primes this, but the claim-exploration voice dock picks a
    // speaker without ever building a preview. Probe on demand there rather than silently dropping
    // the user's choice — and never re-probe once a selection has actually failed.
    if (!audioOutputSupportedRef.current) {
      if (audioOutputSelectionFailedRef.current) return;
      const livekit = await import('livekit-client');
      if (typeof livekit.supportsAudioOutputSelection !== 'function' || !livekit.supportsAudioOutputSelection()) {
        return;
      }
      if (!mountedRef.current) return;
      audioOutputSupportedRef.current = true;
      setAudioOutputSupported(true);
    }
    const generation = audioOutputSelectionGenerationRef.current + 1;
    audioOutputSelectionGenerationRef.current = generation;
    setAudioOutputError(null);
    const selectionPromise = (async () => {
      const isCurrent = () => mountedRef.current && audioOutputSelectionGenerationRef.current === generation;
      try {
        let selectedId = deviceId;
        const authorizedDevice = await authorizeAudioOutput(deviceId);
        if (authorizedDevice) {
          if (!isCurrent()) return;
          selectedId = authorizedDevice.deviceId;
          setAudioOutputDevices(current =>
            current.some(device => device.deviceId === selectedId)
              ? current
              : [
                  ...current,
                  {
                    deviceId: authorizedDevice.deviceId,
                    groupId: authorizedDevice.groupId,
                    kind: 'audiooutput',
                    label: authorizedDevice.label || 'Selected speaker',
                  },
                ]
          );
        }
        if (!isCurrent()) return;
        if (apply) {
          // A newer choice must be the last one routed even if an earlier switch is still pending.
          const previousRoute = audioOutputRoutingPromiseRef.current;
          const routing = (async () => {
            await previousRoute?.catch(() => undefined);
            if (!isCurrent()) return;
            if ((await apply(selectedId)) === false) throw new Error('Device switch failed');
          })();
          audioOutputRoutingPromiseRef.current = routing;
          await routing;
          if (!isCurrent()) return;
        }
        setAudioOutputError(null);
        selectedAudioOutputIdRef.current = selectedId;
        setSelectedAudioOutputId(selectedId);
        rememberMediaDevice('audiooutput', selectedId);
      } catch {
        if (!isCurrent()) return;
        if (apply) {
          setAudioOutputError('Could not move audio to that speaker. Sound is still on the previous one.');
          return;
        }
        audioOutputSelectionFailedRef.current = true;
        audioOutputSupportedRef.current = false;
        selectedAudioOutputIdRef.current = systemDefaultAudioOutput.deviceId;
        setAudioOutputSupported(false);
        setAudioOutputDevices([systemDefaultAudioOutput]);
        setSelectedAudioOutputId(systemDefaultAudioOutput.deviceId);
        setAudioOutputError('This browser could not route audio to that speaker. Using System default.');
      }
    })();
    audioOutputSelectionPromiseRef.current = selectionPromise;
    await selectionPromise;
    if (audioOutputSelectionPromiseRef.current === selectionPromise) audioOutputSelectionPromiseRef.current = null;
  }, []);

  React.useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!activeSessionKey || !mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      const previousAudioInputId = selectedAudioInputIdRef.current;
      const previousVideoInputId = selectedVideoInputIdRef.current;
      void refreshMediaDevices()
        .then(selection => {
          if (!selection || localTracksRef.current.length === 0) return;
          if (selection.audioInputId === previousAudioInputId && selection.videoInputId === previousVideoInputId) {
            return;
          }
          void ensurePreview({
            forceRestart: true,
            audioInputId: selection.audioInputId,
            videoInputId: selection.videoInputId,
          }).catch(() => undefined);
        })
        .catch(() => undefined);
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [activeSessionKey, ensurePreview, refreshMediaDevices]);

  React.useEffect(
    () =>
      subscribeMediaDevicePreferences(() => {
        if (activeSessionKeyRef.current) return;
        const audio = readMediaDevicePreference('audioinput') ?? '';
        const video = readMediaDevicePreference('videoinput') ?? '';
        const output = readMediaDevicePreference('audiooutput') ?? 'default';
        selectedAudioInputIdRef.current = audio;
        selectedVideoInputIdRef.current = video;
        selectedAudioOutputIdRef.current = output;
        setSelectedAudioInputId(audio);
        setSelectedVideoInputId(video);
        setSelectedAudioOutputId(output);
      }),
    []
  );

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewGenerationRef.current += 1;
      mediaDeviceRefreshGenerationRef.current += 1;
      audioOutputSelectionGenerationRef.current += 1;
      stopTracks(localTracksRef.current);
      localTracksRef.current = [];
      localMediaStreamRef.current = null;
    };
  }, []);

  const value = React.useMemo<DebateMediaSession>(
    () => ({
      activeSessionKey,
      previewState,
      previewBusy,
      previewError,
      previewStream,
      audioInputDevices,
      audioOutputDevices,
      videoInputDevices,
      selectedAudioInputId,
      selectedAudioOutputId,
      selectedVideoInputId,
      audioOutputSupported,
      audioOutputError,
      localTracksRef,
      localMediaStreamRef,
      selectedAudioInputIdRef,
      selectedAudioOutputIdRef,
      selectedVideoInputIdRef,
      audioOutputSupportedRef,
      audioOutputSelectionPromiseRef,
      joinChoiceRef,
      beginSession,
      promoteSession,
      releaseSession,
      stopMedia,
      setPreviewStream,
      ensurePreview,
      changeAudioInput,
      changeAudioOutput,
      changeVideoInput,
      reportAudioOutputFailure,
    }),
    [
      activeSessionKey,
      audioInputDevices,
      audioOutputDevices,
      audioOutputError,
      audioOutputSupported,
      beginSession,
      changeAudioInput,
      changeAudioOutput,
      changeVideoInput,
      ensurePreview,
      reportAudioOutputFailure,
      previewBusy,
      previewError,
      previewState,
      previewStream,
      promoteSession,
      releaseSession,
      selectedAudioInputId,
      selectedAudioOutputId,
      selectedVideoInputId,
      setPreviewStream,
      stopMedia,
      videoInputDevices,
    ]
  );

  return <DebateMediaSessionContext.Provider value={value}>{children}</DebateMediaSessionContext.Provider>;
}

export function DebateMediaSessionBoundary({ children }: { children: React.ReactNode }) {
  const session = React.useContext(DebateMediaSessionContext);
  if (session) return children;
  return <DebateMediaSessionProvider>{children}</DebateMediaSessionProvider>;
}

/**
 * The session if there is one, rather than an error if there is not.
 */
export function useOptionalDebateMediaSession() {
  return React.useContext(DebateMediaSessionContext);
}

export function useDebateMediaSession() {
  const session = React.useContext(DebateMediaSessionContext);
  if (!session) throw new Error('useDebateMediaSession must be used inside DebateMediaSessionProvider');
  return session;
}

export function debateMediaSessionKey(debateId: string) {
  return `debate:${debateId}`;
}

/**
 * The session a request card owns, before any debate exists to own it.
 * A profile challenge, which like a request has no debate id until it is accepted.
 */
export function debateChallengeMediaSessionKey(challengeId: string) {
  return `debate-challenge:${challengeId}`;
}

/** The session a claim-picker card owns, which has a picker session but no debate yet. */
export function debateRematchMediaSessionKey(sessionId: string) {
  return `debate-rematch:${sessionId}`;
}

export function debateRequestMediaSessionKey(requestId: string) {
  return `debate-request:${requestId}`;
}

function sameMediaDeviceOptions(current: MediaDeviceOption[], next: MediaDeviceOption[]) {
  return (
    current.length === next.length &&
    current.every(
      (device, index) =>
        device.deviceId === next[index]?.deviceId &&
        device.groupId === next[index]?.groupId &&
        device.kind === next[index]?.kind &&
        device.label === next[index]?.label
    )
  );
}

/**
 * Browser media errors in words a reader can act on.
 *
 * Exported because every surface that calls `ensurePreview` has to explain the same refusals, and
 * `error.message` is the browser's own text — "Permission denied", or a sentence about user agents
 * and platform contexts.
 */
export function preJoinMediaFailure(
  error: unknown,
  /** The kinds that were asked for, so a mic-only surface never mentions a camera. */
  kinds: { audio: boolean; video: boolean } = { audio: true, video: true }
): {
  state: Exclude<PreJoinMediaState, 'requesting' | 'ready'>;
  message: string;
} {
  const both = kinds.audio && kinds.video;
  const devices = both ? 'camera and microphone' : kinds.video ? 'camera' : 'microphone';
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { state: 'denied', message: `Allow access to your ${devices} to continue.` };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { state: 'unavailable', message: `Connect a ${devices}, then try again.` };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      state: 'error',
      message: `Your ${both ? 'camera or microphone' : devices} may be in use by another app. Close it and try again.`,
    };
  }
  return {
    state: 'error',
    message: `We could not start your ${devices}. Check your devices and try again.`,
  };
}

function stopTracks(tracks: LocalTrackLike[]) {
  for (const track of tracks) {
    track.detach?.();
    track.stop();
  }
}
