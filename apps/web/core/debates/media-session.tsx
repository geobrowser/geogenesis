'use client';

import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter';

import * as React from 'react';

export type MediaDeviceOption = {
  deviceId: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
};

export type PreJoinMediaState = 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

export type LocalTrackLike = {
  mediaStreamTrack: MediaStreamTrack;
  setProcessor?: (processor: KrispNoiseFilterProcessor) => Promise<void>;
  stopProcessor?: () => Promise<void>;
  /** The processor LiveKit currently holds, which is not always the one a caller attached. */
  getProcessor?: () => unknown;
  /** The RTP sender carrying this track, once published. */
  sender?: RTCRtpSender | null;
  stop: () => void;
  detach?: () => void;
};

export const systemDefaultAudioOutput: MediaDeviceOption = {
  deviceId: 'default',
  groupId: 'default',
  kind: 'audiooutput',
  label: 'System default',
};

type DebateMediaSession = {
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
  beginSession: (sessionKey: string) => void;
  promoteSession: (fromSessionKey: string, toSessionKey: string) => void;
  releaseSession: (sessionKey: string) => void;
  stopMedia: () => void;
  setPreviewStream: (stream: MediaStream | null) => void;
  ensurePreview: (options?: {
    forceRestart?: boolean;
    audioInputId?: string;
    videoInputId?: string;
  }) => Promise<LocalTrackLike[]>;
  changeAudioInput: (deviceId: string) => void;
  changeAudioOutput: (deviceId: string) => Promise<void>;
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
  const audioOutputSelectionPromiseRef = React.useRef<Promise<void> | null>(null);
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
    const nextAudioInputId = retainOrPreferDefaultDevice(selectedAudioInputIdRef.current, audioInputs);
    const nextAudioOutputId = retainOrPreferDefaultDevice(selectedAudioOutputIdRef.current, availableOutputs);
    const nextVideoInputId = retainOrPreferDefaultDevice(selectedVideoInputIdRef.current, videoInputs);

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
      } = {}
    ) => {
      if (!activeSessionKeyRef.current) return [];
      if (!options.forceRestart && localTracksRef.current.length > 0 && localMediaStreamRef.current) {
        setPreviewStreamState(localMediaStreamRef.current);
        setPreviewState('ready');
        setPreviewBusy(false);
        return localTracksRef.current;
      }
      if (localPreviewPromiseRef.current) {
        if (!options.forceRestart) return localPreviewPromiseRef.current;
        await localPreviewPromiseRef.current.catch(() => undefined);
      }

      const replacingReadyPreview =
        Boolean(options.forceRestart) && localTracksRef.current.length > 0 && localMediaStreamRef.current !== null;
      setPreviewError(null);
      setPreviewBusy(true);
      if (!replacingReadyPreview) setPreviewState('requesting');
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
        stopTracks(localTracksRef.current);
        localTracksRef.current = [];
        localMediaStreamRef.current = null;
        if (!replacingReadyPreview) setPreviewStreamState(null);
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
        if (
          !tracks.some(track => track.mediaStreamTrack.kind === 'audio') ||
          !tracks.some(track => track.mediaStreamTrack.kind === 'video')
        ) {
          stopTracks(tracks);
          throw Object.assign(new Error('Required media tracks are unavailable.'), { name: 'NotFoundError' });
        }
        localTracksRef.current = tracks;
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
      try {
        return await previewPromise;
      } catch (error) {
        if (isCurrent()) {
          stopTracks(localTracksRef.current);
          localTracksRef.current = [];
          localMediaStreamRef.current = null;
          const failure = preJoinMediaFailure(error);
          setPreviewError(failure.message);
          setPreviewState(failure.state);
          setPreviewBusy(false);
          setPreviewStreamState(null);
        }
        throw error;
      } finally {
        if (localPreviewPromiseRef.current === previewPromise) localPreviewPromiseRef.current = null;
      }
    },
    [refreshMediaDevices]
  );

  const changeAudioInput = React.useCallback(
    (deviceId: string) => {
      selectedAudioInputIdRef.current = deviceId;
      setSelectedAudioInputId(deviceId);
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
      void ensurePreview({
        forceRestart: true,
        audioInputId: selectedAudioInputIdRef.current,
        videoInputId: deviceId,
      }).catch(() => undefined);
    },
    [ensurePreview]
  );

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
      beginSession,
      promoteSession,
      releaseSession,
      stopMedia,
      setPreviewStream,
      ensurePreview,
      changeAudioInput,
      changeAudioOutput,
      changeVideoInput,
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

export function useDebateMediaSession() {
  const session = React.useContext(DebateMediaSessionContext);
  if (!session) throw new Error('useDebateMediaSession must be used inside DebateMediaSessionProvider');
  return session;
}

export function debateMediaSessionKey(debateId: string) {
  return `debate:${debateId}`;
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

function preJoinMediaFailure(error: unknown): {
  state: Exclude<PreJoinMediaState, 'requesting' | 'ready'>;
  message: string;
} {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { state: 'denied', message: 'Allow access to your camera and microphone to continue.' };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { state: 'unavailable', message: 'Connect a camera and microphone, then try again.' };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      state: 'error',
      message: 'Your camera or microphone may be in use by another app. Close it and try again.',
    };
  }
  return {
    state: 'error',
    message: 'We could not start your camera and microphone. Check your devices and try again.',
  };
}

function stopTracks(tracks: LocalTrackLike[]) {
  for (const track of tracks) {
    track.detach?.();
    track.stop();
  }
}
