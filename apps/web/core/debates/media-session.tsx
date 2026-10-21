'use client';

import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import * as React from 'react';

import type { DebateJoinChoice } from './request-join-state';

export type MediaDeviceOption = {
  deviceId: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
};

export type PreJoinMediaState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

export type LocalTrackLike = {
  mediaStreamTrack: MediaStreamTrack;
  /** Restarts capture and replaces the published sender without changing the LocalTrack. */
  restartTrack?: (options?: { deviceId?: string }) => Promise<void>;
  mediaStream?: MediaStream;
  on?: (event: string, callback: () => void) => unknown;
  off?: (event: string, callback: () => void) => unknown;
  setProcessor?: (processor: KrispNoiseFilterProcessor) => Promise<void>;
  stopProcessor?: () => Promise<void>;
  stop: () => void;
  detach?: () => void;
};

/** The capture source can differ from mediaStreamTrack when Krisp supplies processed audio. */
export function localTrackSource(track: LocalTrackLike) {
  return track.mediaStream?.getTracks()[0] ?? track.mediaStreamTrack;
}

export function isLocalTrackLive(track: LocalTrackLike) {
  return localTrackSource(track).readyState !== 'ended';
}

export function setLocalTrackEnabled(track: LocalTrackLike, enabled: boolean, source?: MediaStreamTrack) {
  track.mediaStreamTrack.enabled = enabled;
  (source ?? localTrackSource(track)).enabled = enabled;
}

export const systemDefaultAudioOutput: MediaDeviceOption = {
  deviceId: 'default',
  groupId: 'default',
  kind: 'audiooutput',
  label: 'System default',
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
  changeAudioOutput: (deviceId: string) => Promise<void>;
  /**
   * Report that audio could not be routed to the selected speaker. `changeAudioOutput` handles the
   * picker's own failures; this is for the caller that owns a live room, where the route is applied
   * separately and can fail on its own.
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
  const mediaLifecycleRef = React.useRef(0);
  const inputChangePromiseRef = React.useRef<Promise<void>>(Promise.resolve());
  const deviceOptionsRef = React.useRef<MediaDeviceOption[]>([]);
  /** A caller restarting without explicit kinds must preserve the session's last choice. */
  const wantedKindsRef = React.useRef({ audio: true, video: true });
  const audioOutputSelectionPromiseRef = React.useRef<Promise<void> | null>(null);
  const selectedAudioInputIdRef = React.useRef('');
  const selectedAudioOutputIdRef = React.useRef(systemDefaultAudioOutput.deviceId);
  const selectedVideoInputIdRef = React.useRef('');
  const audioOutputSupportedRef = React.useRef(false);
  const audioOutputSelectionFailedRef = React.useRef(false);

  const stopMedia = React.useCallback(() => {
    mediaLifecycleRef.current += 1;
    mediaDeviceRefreshGenerationRef.current += 1;
    inputChangePromiseRef.current = Promise.resolve();
    previewGenerationRef.current += 1;
    audioOutputSelectionGenerationRef.current += 1;
    stopTracks(localTracksRef.current);
    localTracksRef.current = [];
    localMediaStreamRef.current = null;
    localPreviewPromiseRef.current = null;
    localPreviewWantRef.current = null;
    audioOutputSelectionPromiseRef.current = null;
    setPreviewStreamState(null);
    setPreviewState('requesting');
    setPreviewBusy(true);
    setPreviewError(null);
  }, []);

  const beginSession = React.useCallback(
    (sessionKey: string) => {
      if (activeSessionKeyRef.current === sessionKey) return;
      stopMedia();
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
    const audioInputs = devices
      .filter(device => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        kind: 'audioinput' as const,
        label: device.label || `Microphone ${index + 1}`,
      }));
    const audioOutputs = audioOutputSupportedRef.current
      ? devices
          .filter(device => device.kind === 'audiooutput')
          .map((device, index) => ({
            deviceId: device.deviceId,
            groupId: device.groupId,
            kind: 'audiooutput' as const,
            label: device.label || `Speaker ${index + 1}`,
          }))
      : [systemDefaultAudioOutput];
    const videoInputs = devices
      .filter(device => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        groupId: device.groupId,
        kind: 'videoinput' as const,
        label: device.label || `Camera ${index + 1}`,
      }));

    const availableOutputs = audioOutputs.length > 0 ? audioOutputs : [systemDefaultAudioOutput];
    setAudioInputDevices(current => (sameMediaDeviceOptions(current, audioInputs) ? current : audioInputs));
    setAudioOutputDevices(current => (sameMediaDeviceOptions(current, availableOutputs) ? current : availableOutputs));
    setVideoInputDevices(current => (sameMediaDeviceOptions(current, videoInputs) ? current : videoInputs));
    const previousDevices = deviceOptionsRef.current;
    deviceOptionsRef.current = [...audioInputs, ...videoInputs];
    const changed = (kind: string, current: string, next: string) =>
      current !== next ||
      (current === 'default' &&
        previousDevices.find(device => device.kind === kind && device.deviceId === current)?.groupId !==
          deviceOptionsRef.current.find(device => device.kind === kind && device.deviceId === next)?.groupId);
    const nextAudioInputId = retainOrPreferDefaultDevice(selectedAudioInputIdRef.current, audioInputs);
    const nextAudioOutputId = retainOrPreferDefaultDevice(selectedAudioOutputIdRef.current, availableOutputs);
    const nextVideoInputId = retainOrPreferDefaultDevice(selectedVideoInputIdRef.current, videoInputs);

    const audioChanged = changed('audioinput', selectedAudioInputIdRef.current, nextAudioInputId);
    const videoChanged = changed('videoinput', selectedVideoInputIdRef.current, nextVideoInputId);
    selectedAudioInputIdRef.current = nextAudioInputId;
    selectedAudioOutputIdRef.current = nextAudioOutputId;
    selectedVideoInputIdRef.current = nextVideoInputId;
    setSelectedAudioInputId(nextAudioInputId);
    setSelectedAudioOutputId(nextAudioOutputId);
    setSelectedVideoInputId(nextVideoInputId);

    return { audioInputId: nextAudioInputId, videoInputId: nextVideoInputId, audioChanged, videoChanged };
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

      const liveKinds = new Set(
        localTracksRef.current.filter(isLocalTrackLive).map(track => track.mediaStreamTrack.kind)
      );
      const hasLivePreview = liveKinds.size > 0 && localMediaStreamRef.current !== null;
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

  // Serialize input operations: rapid selections and devicechange can otherwise finish in reverse
  // order. A released session invalidates queued work; a promotion deliberately does not.
  const switchInput = React.useCallback(
    (kind: 'audio' | 'video', deviceId: string) => {
      const generation = mediaLifecycleRef.current;
      const isCurrent = () => mountedRef.current && generation === mediaLifecycleRef.current;
      const operation = inputChangePromiseRef.current
        .catch(() => undefined)
        .then(async () => {
          await localPreviewPromiseRef.current?.catch(() => undefined);
          if (!isCurrent() || !activeSessionKeyRef.current) return;
          const track = localTracksRef.current.find(track => track.mediaStreamTrack.kind === kind);
          // Choosing a device for a disabled kind must not turn it on.
          if (!track?.restartTrack) return;
          const previousId = localTrackSource(track).getSettings?.().deviceId;
          const previousCapture = track.mediaStreamTrack;
          const restorePreferences = () => {
            // Toggles and turn changes can happen while capture is reopening.
            setLocalTrackEnabled(track, previousCapture.enabled);
          };
          const updatePreview = () => {
            restorePreferences();
            setPreviewStream(new MediaStream(localTracksRef.current.map(track => track.mediaStreamTrack)));
          };
          setPreviewBusy(true);
          setPreviewError(null);
          try {
            await track.restartTrack({ deviceId: deviceId || 'default' });
            if (!isCurrent()) {
              track.stop();
              return;
            }
            updatePreview();
            setPreviewState('ready');
          } catch (error) {
            if (!isCurrent()) return;
            // The SDK stops the old capture before opening the new one. Recover the previous device,
            // or the system default if it disappeared, without discarding the publication.
            try {
              await track.restartTrack({ deviceId: previousId || 'default' });
            } catch {
              if (isCurrent()) await track.restartTrack({ deviceId: 'default' }).catch(() => undefined);
            }
            if (!isCurrent()) {
              track.stop();
              return;
            }
            updatePreview();
            const recoveredId = isLocalTrackLive(track) ? (localTrackSource(track).getSettings?.().deviceId ?? '') : '';
            setPreviewState(isLocalTrackLive(track) ? 'ready' : 'error');
            if (kind === 'audio' && selectedAudioInputIdRef.current === deviceId) {
              selectedAudioInputIdRef.current = recoveredId;
              setSelectedAudioInputId(recoveredId);
            } else if (kind === 'video' && selectedVideoInputIdRef.current === deviceId) {
              selectedVideoInputIdRef.current = recoveredId;
              setSelectedVideoInputId(recoveredId);
            }
            setPreviewError(preJoinMediaFailure(error, { audio: kind === 'audio', video: kind === 'video' }).message);
          } finally {
            if (isCurrent()) setPreviewBusy(false);
          }
        });
      inputChangePromiseRef.current = operation;
      return operation;
    },
    [setPreviewStream]
  );

  const changeAudioInput = React.useCallback(
    (deviceId: string) => {
      selectedAudioInputIdRef.current = deviceId;
      setSelectedAudioInputId(deviceId);
      void switchInput('audio', deviceId).catch(() => undefined);
    },
    [switchInput]
  );

  const changeVideoInput = React.useCallback(
    (deviceId: string) => {
      selectedVideoInputIdRef.current = deviceId;
      setSelectedVideoInputId(deviceId);
      void switchInput('video', deviceId).catch(() => undefined);
    },
    [switchInput]
  );

  // LiveKit also reacquires capture after an OS interruption. Keep preview/recording consumers
  // pointed at its current processed tracks, including restarts initiated by the SDK itself.
  React.useEffect(() => {
    const tracks = localTracksRef.current;
    const update = () => {
      if (localTracksRef.current !== tracks) return;
      for (const track of tracks) {
        const previous = previewStream?.getTracks().find(previous => previous.kind === track.mediaStreamTrack.kind);
        if (previous) {
          setLocalTrackEnabled(track, previous.enabled);
        }
      }
      setPreviewStream(new MediaStream(tracks.map(track => track.mediaStreamTrack)));
    };
    for (const track of tracks) track.on?.('restarted', update);
    return () => {
      for (const track of tracks) track.off?.('restarted', update);
    };
  }, [previewStream, setPreviewStream]);

  const reportAudioOutputFailure = React.useCallback((message: string | null) => {
    setAudioOutputError(message);
  }, []);

  const changeAudioOutput = React.useCallback(async (deviceId: string) => {
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
        const mediaDevices = navigator.mediaDevices as MediaDevices & {
          selectAudioOutput?: (options: { deviceId: string }) => Promise<MediaDeviceInfo>;
        };
        if (deviceId !== systemDefaultAudioOutput.deviceId && mediaDevices.selectAudioOutput) {
          const authorizedDevice = await mediaDevices.selectAudioOutput({ deviceId });
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
        selectedAudioOutputIdRef.current = selectedId;
        setSelectedAudioOutputId(selectedId);
      } catch {
        if (!isCurrent()) return;
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
      void refreshMediaDevices()
        .then(async selection => {
          if (!selection || localTracksRef.current.length === 0) return;
          for (const kind of ['audio', 'video'] as const) {
            const track = localTracksRef.current.find(track => track.mediaStreamTrack.kind === kind);
            const changed = kind === 'audio' ? selection.audioChanged : selection.videoChanged;
            if (track && (changed || !isLocalTrackLive(track))) {
              await switchInput(kind, kind === 'audio' ? selection.audioInputId : selection.videoInputId);
            }
          }
        })
        .catch(() => undefined);
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [activeSessionKey, refreshMediaDevices, switchInput]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mediaLifecycleRef.current += 1;
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

function retainOrPreferDefaultDevice(current: string, devices: MediaDeviceOption[]) {
  if (current && devices.some(device => device.deviceId === current)) return current;
  return devices.find(device => device.deviceId === 'default')?.deviceId ?? devices[0]?.deviceId ?? '';
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
