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
  readMediaDevicePreference,
  rememberMediaDevice,
  resolveActiveMediaDevice,
  subscribeMediaDevicePreferences,
} from '~/core/media/device-preferences';

import type { DebateJoinChoice } from './request-join-state';

export { systemDefaultAudioOutput } from '~/core/media/device-options';
export type { MediaDeviceOption } from '~/core/media/device-options';

export type PreJoinMediaState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

export type LocalTrackLike = {
  mediaStreamTrack: MediaStreamTrack;
  /** Restarts capture and replaces the published sender without changing the LocalTrack. */
  restartTrack?: (options?: { deviceId?: ConstrainDOMString }) => Promise<void>;
  mediaStream?: MediaStream;
  on?: (event: string, callback: () => void) => unknown;
  off?: (event: string, callback: () => void) => unknown;
  setProcessor?: (processor: KrispNoiseFilterProcessor) => Promise<void>;
  stopProcessor?: () => Promise<void>;
  stop: () => void;
  detach?: () => void;
};

type LocalCapture = Pick<LocalTrackLike, 'mediaStreamTrack' | 'mediaStream'>;

/** The capture source can differ from mediaStreamTrack when Krisp supplies processed audio. */
export function localTrackSource(track: LocalCapture) {
  return (
    track.mediaStream?.getTracks().find(source => source.kind === track.mediaStreamTrack.kind) ?? track.mediaStreamTrack
  );
}

export function isLocalTrackLive(track: LocalCapture) {
  return localTrackSource(track).readyState !== 'ended';
}

export function setLocalTrackEnabled(track: LocalCapture, enabled: boolean, source?: MediaStreamTrack) {
  track.mediaStreamTrack.enabled = enabled;
  (source ?? localTrackSource(track)).enabled = enabled;
}

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
  const mediaSessionGenerationRef = React.useRef(0);
  // Freeze restoration preferences per session; another tab must not move a live call's devices.
  const sessionPreferencesRef = React.useRef<Partial<Record<MediaDeviceKind, string>>>({});
  const pendingInputsRef = React.useRef<Partial<Record<MediaDeviceKind, string>>>({});
  const previousDevicesRef = React.useRef<MediaDeviceInfo[]>([]);
  const inputSelectionGenerationRef = React.useRef({ audioinput: 0, videoinput: 0 });
  const localTracksRef = React.useRef<LocalTrackLike[]>([]);
  const localMediaStreamRef = React.useRef<MediaStream | null>(null);
  const localPreviewPromiseRef = React.useRef<Promise<LocalTrackLike[]> | null>(null);
  const joinChoiceRef = React.useRef<DebateJoinChoice | null>(null);
  /** What the in-flight acquisition asked for, so a call wanting something else is not handed it. */
  const localPreviewWantRef = React.useRef<{ audio: boolean; video: boolean } | null>(null);
  const mediaLifecycleRef = React.useRef(0);
  const inputChangePromiseRef = React.useRef<Promise<void>>(Promise.resolve());
  /** A caller restarting without explicit kinds must preserve the session's last choice. */
  const wantedKindsRef = React.useRef({ audio: true, video: true });
  const audioOutputSelectionPromiseRef = React.useRef<Promise<void> | null>(null);
  const audioOutputRoutingPromiseRef = React.useRef<Promise<void> | null>(null);
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
    mediaSessionGenerationRef.current += 1;
    pendingInputsRef.current = {};
    previousDevicesRef.current = [];
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
      sessionPreferencesRef.current = {
        audioinput: selectedAudioInputIdRef.current,
        videoinput: selectedVideoInputIdRef.current,
        audiooutput: selectedAudioOutputIdRef.current,
      };
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
    const previousDevices = previousDevicesRef.current;
    const changed = (kind: string, current: string, next: string) =>
      current !== next ||
      (current === 'default' &&
        previousDevices.find(device => device.kind === kind && device.deviceId === current)?.groupId !==
          devices.find(device => device.kind === kind && device.deviceId === next)?.groupId);
    const resolve = (kind: MediaDeviceKind, current: string) =>
      resolveActiveMediaDevice(
        pendingInputsRef.current[kind] ?? sessionPreferencesRef.current[kind] ?? current,
        current,
        devices.filter(device => device.kind === kind),
        previousDevicesRef.current.filter(device => device.kind === kind)
      );
    const nextAudioInputId = resolve('audioinput', selectedAudioInputIdRef.current);
    const nextAudioOutputId = audioOutputSupportedRef.current
      ? resolve('audiooutput', selectedAudioOutputIdRef.current)
      : systemDefaultAudioOutput.deviceId;
    const nextVideoInputId = resolve('videoinput', selectedVideoInputIdRef.current);
    previousDevicesRef.current = devices;

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

  // Drain selections queued while we were waiting too. Preview acquisition and input restarts
  // must not acquire/stop the same capture at the same time.
  const waitForInputChanges = React.useCallback(async () => {
    let pending: Promise<void>;
    do {
      pending = inputChangePromiseRef.current;
      await pending.catch(() => undefined);
    } while (pending !== inputChangePromiseRef.current);
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
      const lifecycle = mediaLifecycleRef.current;
      const wantAudio = options.audio ?? wantedKindsRef.current.audio;
      const wantVideo = options.video ?? wantedKindsRef.current.video;
      const inFlight = localPreviewWantRef.current;
      // Remember a matching acquisition before yielding to the input queue: its refusal belongs
      // to both callers even if the acquisition has already cleared its ref by the time we resume.
      const sharedPreview =
        !options.forceRestart && inFlight?.audio === wantAudio && inFlight.video === wantVideo
          ? localPreviewPromiseRef.current
          : null;
      await waitForInputChanges();
      if (!mountedRef.current || !activeSessionKeyRef.current || mediaLifecycleRef.current !== lifecycle) return [];
      if (sharedPreview) {
        await sharedPreview;
        await waitForInputChanges();
        if (!mountedRef.current || !activeSessionKeyRef.current || mediaLifecycleRef.current !== lifecycle) return [];
      }
      wantedKindsRef.current = { audio: wantAudio, video: wantVideo };

      if (localPreviewPromiseRef.current) {
        const inFlight = localPreviewWantRef.current;
        const sameKinds = inFlight !== null && inFlight.audio === wantAudio && inFlight.video === wantVideo;
        if (!options.forceRestart && sameKinds) return localPreviewPromiseRef.current;
        await localPreviewPromiseRef.current.catch(() => undefined);
        await waitForInputChanges();
        if (!mountedRef.current || !activeSessionKeyRef.current || mediaLifecycleRef.current !== lifecycle) return [];
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
          // Only release the tracks this acquisition opened, never a replacement session.
          stopTracks(tracks);
          if (localTracksRef.current === tracks) {
            localTracksRef.current = [];
            localMediaStreamRef.current = null;
            setPreviewStreamState(null);
          }
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
    [refreshMediaDevices, waitForInputChanges]
  );

  // Serialize input operations: rapid selections and devicechange can otherwise finish in reverse
  // order. A released session invalidates queued work; a promotion deliberately does not.
  const switchInput = React.useCallback(
    (kind: 'audio' | 'video', deviceId: string) => {
      const generation = mediaLifecycleRef.current;
      const isCurrent = () => mountedRef.current && generation === mediaLifecycleRef.current;
      let result: LocalTrackLike[] | null = null;
      const operation = inputChangePromiseRef.current
        .catch(() => undefined)
        .then(async () => {
          await localPreviewPromiseRef.current?.catch(() => undefined);
          if (!isCurrent() || !activeSessionKeyRef.current) return;
          const track = localTracksRef.current.find(track => track.mediaStreamTrack.kind === kind);
          // Choosing a device for a disabled kind must not turn it on.
          if (!track?.restartTrack) return;
          const restartTrack = track.restartTrack.bind(track);
          const restartCapture = (id?: string) =>
            restartTrack({
              // Unlike createLocalTracks, restartTrack leaves string IDs as ideal constraints.
              // An explicit hardware choice must not silently reopen the browser's default.
              deviceId: id && id !== 'default' && id !== 'communications' ? { exact: id } : id || 'default',
            });
          const ownsTrack = () => isCurrent() && localTracksRef.current.includes(track);
          const previousId = localTrackSource(track).getSettings?.().deviceId;
          const previousCapture = track.mediaStreamTrack;
          const reconcileSelection = (failed = false) => {
            const actualId = isLocalTrackLive(track) ? localTrackSource(track).getSettings?.().deviceId : '';
            // System aliases deliberately follow the OS. Never replace a newer queued choice.
            if (!failed && (!actualId || deviceId === 'default' || deviceId === 'communications')) return;
            const selectedRef = kind === 'audio' ? selectedAudioInputIdRef : selectedVideoInputIdRef;
            if (selectedRef.current !== deviceId) return;
            const nextId = actualId ?? '';
            selectedRef.current = nextId;
            (kind === 'audio' ? setSelectedAudioInputId : setSelectedVideoInputId)(nextId);
          };
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
            await restartCapture(deviceId);
            if (!ownsTrack()) {
              track.stop();
              return;
            }
            updatePreview();
            reconcileSelection();
            result = localTracksRef.current;
            setPreviewState('ready');
          } catch (error) {
            if (!ownsTrack()) {
              track.stop();
              return;
            }
            // The SDK stops the old capture before opening the new one. Recover the previous device,
            // or the system default if it disappeared, without discarding the publication.
            try {
              await restartCapture(previousId);
            } catch {
              if (ownsTrack()) await restartCapture('default').catch(() => undefined);
            }
            if (!ownsTrack()) {
              track.stop();
              return;
            }
            updatePreview();
            setPreviewState(isLocalTrackLive(track) ? 'ready' : 'error');
            reconcileSelection(true);
            setPreviewError(preJoinMediaFailure(error, { audio: kind === 'audio', video: kind === 'video' }).message);
          } finally {
            if (isCurrent()) setPreviewBusy(false);
          }
        });
      inputChangePromiseRef.current = operation;
      return operation.then(() => result);
    },
    [setPreviewStream]
  );

  const changeInput = React.useCallback(
    (kind: 'audioinput' | 'videoinput', deviceId: string) => {
      const generation = mediaSessionGenerationRef.current;
      const selection = ++inputSelectionGenerationRef.current[kind];
      const isCurrent = () =>
        mountedRef.current &&
        mediaSessionGenerationRef.current === generation &&
        inputSelectionGenerationRef.current[kind] === selection;
      const selectedRef = kind === 'audioinput' ? selectedAudioInputIdRef : selectedVideoInputIdRef;
      const setSelected = kind === 'audioinput' ? setSelectedAudioInputId : setSelectedVideoInputId;
      const select = (id: string) => {
        selectedRef.current = id;
        setSelected(id);
      };
      pendingInputsRef.current[kind] = deviceId;
      select(deviceId);
      const commit = () => {
        if (!isCurrent()) return;
        delete pendingInputsRef.current[kind];
        sessionPreferencesRef.current[kind] = deviceId;
        rememberMediaDevice(kind, deviceId);
      };
      // Claim pickers have already switched their live room before carrying the choice here.
      if (
        !activeSessionKeyRef.current ||
        !(kind === 'audioinput' ? wantedKindsRef.current.audio : wantedKindsRef.current.video)
      ) {
        commit();
        return;
      }
      const operation =
        localTracksRef.current.length === 0
          ? ensurePreview({
              audioInputId: selectedAudioInputIdRef.current,
              videoInputId: selectedVideoInputIdRef.current,
            })
          : switchInput(kind === 'audioinput' ? 'audio' : 'video', deviceId);
      void operation
        .then(tracks => {
          if (!isCurrent()) return;
          delete pendingInputsRef.current[kind];
          if (!tracks) return; // A failed restart recovered capture but must not save the failed choice.
          const mediaKind = kind === 'audioinput' ? 'audio' : 'video';
          const capture = tracks.find(track => track.mediaStreamTrack.kind === mediaKind);
          const actualId = capture ? localTrackSource(capture).getSettings?.().deviceId : undefined;
          if (actualId && deviceId !== 'default' && deviceId !== 'communications' && actualId !== deviceId) {
            // Ideal constraints can silently substitute hardware. Keep the saved preference, and
            // describe the device that actually opened rather than saving the unavailable request.
            delete pendingInputsRef.current[kind];
            select(actualId);
            return;
          }
          commit();
        })
        .catch(() => {
          if (!isCurrent()) return;
          delete pendingInputsRef.current[kind];
          select(sessionPreferencesRef.current[kind] ?? '');
          void refreshMediaDevices().catch(() => undefined);
        });
    },
    [ensurePreview, refreshMediaDevices, switchInput]
  );

  const changeAudioInput = React.useCallback((deviceId: string) => changeInput('audioinput', deviceId), [changeInput]);
  const changeVideoInput = React.useCallback((deviceId: string) => changeInput('videoinput', deviceId), [changeInput]);

  // LiveKit also reacquires capture after an OS interruption. Keep preview/recording consumers
  // pointed at its current processed tracks, including restarts initiated by the SDK itself.
  React.useEffect(() => {
    const cleanups = localTracksRef.current.map(restartedTrack => {
      const update = () => {
        // Adding another kind can replace the array without replacing this LocalTrack.
        const tracks = localTracksRef.current;
        if (!tracks.includes(restartedTrack)) return;
        for (const track of tracks) {
          const previous = previewStream?.getTracks().find(previous => previous.kind === track.mediaStreamTrack.kind);
          if (previous) {
            setLocalTrackEnabled(track, previous.enabled);
          }
        }
        setPreviewStream(new MediaStream(tracks.map(track => track.mediaStreamTrack)));
      };
      restartedTrack.on?.('restarted', update);
      return () => restartedTrack.off?.('restarted', update);
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [previewStream, setPreviewStream]);

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
    const sessionGeneration = mediaSessionGenerationRef.current;
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
        const commitSelection = () => {
          if (!mountedRef.current || mediaSessionGenerationRef.current !== sessionGeneration) return;
          // A completed live switch is now the audible device, even if another choice is pending.
          // Keep its preference in sync, but do not clear an error from the newer choice.
          if (isCurrent()) setAudioOutputError(null);
          selectedAudioOutputIdRef.current = selectedId;
          setSelectedAudioOutputId(selectedId);
          sessionPreferencesRef.current.audiooutput = selectedId;
          rememberMediaDevice('audiooutput', selectedId);
        };
        if (apply) {
          // A newer choice must be the last one routed even if an earlier switch is still pending.
          const previousRoute = audioOutputRoutingPromiseRef.current;
          const routing = (async () => {
            await previousRoute?.catch(() => undefined);
            if (!isCurrent()) return;
            if ((await apply(selectedId)) === false) throw new Error('Device switch failed');
            // Commit inside the route queue, before a later switch can complete.
            commitSelection();
          })();
          audioOutputRoutingPromiseRef.current = routing;
          await routing;
          return;
        }
        commitSelection();
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
      void refreshMediaDevices()
        .then(async selection => {
          if (!selection || localTracksRef.current.length === 0) return;
          const fallbacks: Promise<LocalTrackLike[] | null>[] = [];
          for (const kind of ['audio', 'video'] as const) {
            const track = localTracksRef.current.find(track => track.mediaStreamTrack.kind === kind);
            const changed = kind === 'audio' ? selection.audioChanged : selection.videoChanged;
            if (track && (changed || !isLocalTrackLive(track))) {
              fallbacks.push(switchInput(kind, kind === 'audio' ? selection.audioInputId : selection.videoInputId));
            }
          }
          // Queue the whole hardware event before a subsequent manual selection can overtake it.
          await Promise.all(fallbacks);
        })
        .catch(() => undefined);
    };
    mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [activeSessionKey, refreshMediaDevices, switchInput]);

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
      mediaLifecycleRef.current += 1;
      previewGenerationRef.current += 1;
      mediaDeviceRefreshGenerationRef.current += 1;
      audioOutputSelectionGenerationRef.current += 1;
      mediaSessionGenerationRef.current += 1;
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
