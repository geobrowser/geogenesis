'use client';

import { usePreviewTracks } from '@livekit/components-react';

import * as React from 'react';

import { Track } from 'livekit-client';

import { formatFullDate, formatTimeRange } from '~/core/community-calls/format';
import { Occurrence } from '~/core/community-calls/types';
import {
  readMediaDevicePreference,
  rememberMediaDevice,
  resolveActiveMediaDevice,
  subscribeMediaDevicePreferences,
} from '~/core/media/device-preferences';
import { useInitialMediaDevices } from '~/core/media/use-initial-media-devices';

import { Button } from '~/design-system/button';
import { Select } from '~/design-system/select';

import { GlobeIcon, MicIcon, VideoIcon } from './icons';

export type PreJoinSettings = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioDeviceId?: string;
  videoDeviceId?: string;
};

type Props = {
  spaceName: string;
  occurrence: Occurrence;
  joining: boolean;
  onJoin: (settings: PreJoinSettings) => void;
};

/** Local device preview shown before minting the LiveKit token. */
export function PreJoin({ spaceName, occurrence, joining, onJoin }: Props) {
  const [audioEnabled, setAudioEnabled] = React.useState(false);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const initialDevices = useInitialMediaDevices();
  const [pickedAudioDeviceId, setAudioDeviceId] = React.useState<string>();
  const [pickedVideoDeviceId, setVideoDeviceId] = React.useState<string>();
  const audioDeviceId = pickedAudioDeviceId ?? initialDevices.audioInputId;
  const videoDeviceId = pickedVideoDeviceId ?? initialDevices.videoInputId;
  const [devices, setDevices] = React.useState<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({
    audio: [],
    video: [],
  });
  const preferredInputsRef = React.useRef<{ audio?: string; video?: string } | null>(null);
  const previousDevicesRef = React.useRef<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({
    audio: [],
    video: [],
  });
  const pendingInputsRef = React.useRef<
    Partial<Record<'audio' | 'video', { id: string; previousTrack?: MediaStreamTrack }>>
  >({});
  const [rememberedInputs, setRememberedInputs] = React.useState<{ audio?: string; video?: string }>({});
  React.useEffect(() => {
    const refresh = () =>
      setRememberedInputs({
        audio: readMediaDevicePreference('audioinput'),
        video: readMediaDevicePreference('videoinput'),
      });
    refresh();
    return subscribeMediaDevicePreferences(refresh);
  }, []);
  const canRememberCurrent =
    (audioDeviceId && rememberedInputs.audio !== audioDeviceId) ||
    (videoDeviceId && rememberedInputs.video !== videoDeviceId);
  const [permissionError, setPermissionError] = React.useState<string | null>(null);

  const onPreviewError = React.useCallback((err: Error) => {
    // Never save a failed choice or join claiming tracks that could not be opened.
    pendingInputsRef.current = {};
    setAudioDeviceId(preferredInputsRef.current?.audio);
    setVideoDeviceId(preferredInputsRef.current?.video);
    setAudioEnabled(false);
    setVideoEnabled(false);
    setPermissionError(
      err.name === 'NotAllowedError'
        ? 'Camera/microphone access was denied. You can still join without video.'
        : err.message
    );
  }, []);
  const tracks = usePreviewTracks(
    {
      audio:
        initialDevices.ready && audioEnabled ? (audioDeviceId ? { deviceId: { ideal: audioDeviceId } } : true) : false,
      video:
        initialDevices.ready && videoEnabled ? (videoDeviceId ? { deviceId: { ideal: videoDeviceId } } : true) : false,
    },
    onPreviewError
  );

  React.useEffect(() => {
    if (initialDevices.ready && !preferredInputsRef.current) {
      preferredInputsRef.current = {
        audio: readMediaDevicePreference('audioinput'),
        video: readMediaDevicePreference('videoinput'),
      };
    }
  }, [initialDevices.ready]);

  const rememberInput = React.useCallback((kind: 'audio' | 'video', id: string) => {
    preferredInputsRef.current ??= {};
    preferredInputsRef.current[kind] = id;
    delete pendingInputsRef.current[kind];
    rememberMediaDevice(kind === 'audio' ? 'audioinput' : 'videoinput', id);
  }, []);

  const chooseInput = (kind: 'audio' | 'video', id: string) => {
    const enabled = kind === 'audio' ? audioEnabled : videoEnabled;
    const current = tracks?.find(track => track.kind === kind)?.mediaStreamTrack;
    const currentId = kind === 'audio' ? audioDeviceId : videoDeviceId;
    if (!enabled || current?.getSettings().deviceId === id || (id === 'default' && current && currentId === id)) {
      // A disabled kind is an explicit choice for later; it must not open capture just to save it.
      rememberInput(kind, id);
    } else {
      pendingInputsRef.current[kind] = { id, previousTrack: current };
    }
    if (kind === 'audio') setAudioDeviceId(id);
    else setVideoDeviceId(id);
  };

  React.useEffect(() => {
    for (const kind of ['audio', 'video'] as const) {
      const pending = pendingInputsRef.current[kind];
      const current = tracks?.find(track => track.kind === kind)?.mediaStreamTrack;
      if (!pending || !current || current === pending.previousTrack) continue;
      const actualId = current.getSettings().deviceId;
      if (pending.id === 'default' || actualId === pending.id) {
        rememberInput(kind, pending.id);
      } else if (actualId) {
        delete pendingInputsRef.current[kind];
        if (kind === 'audio') setAudioDeviceId(actualId);
        else setVideoDeviceId(actualId);
      }
    }
  }, [tracks, rememberInput]);

  const videoTrack = tracks?.find(t => t.kind === Track.Kind.Video);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoTrack) return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);

  // Enumerate again after permission, and when a device is plugged in or removed.
  React.useEffect(() => {
    if (!initialDevices.ready) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await navigator.mediaDevices?.enumerateDevices();
        if (cancelled || !list) return;
        const audio = list.filter(d => d.kind === 'audioinput' && d.deviceId);
        const video = list.filter(d => d.kind === 'videoinput' && d.deviceId);
        setDevices({ audio, video });
        // Update effective selections only. A disconnected device stays remembered in storage.
        const preferredAudio = pendingInputsRef.current.audio?.id ?? preferredInputsRef.current?.audio ?? audioDeviceId;
        const preferredVideo = pendingInputsRef.current.video?.id ?? preferredInputsRef.current?.video ?? videoDeviceId;
        if (audio.length && preferredAudio)
          setAudioDeviceId(
            resolveActiveMediaDevice(preferredAudio, audioDeviceId ?? '', audio, previousDevicesRef.current.audio)
          );
        if (video.length && preferredVideo)
          setVideoDeviceId(
            resolveActiveMediaDevice(preferredVideo, videoDeviceId ?? '', video, previousDevicesRef.current.video)
          );
        previousDevicesRef.current = { audio, video };
      } catch {
        // Keep the preview usable if enumeration is unavailable.
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, [tracks, audioDeviceId, videoDeviceId, initialDevices.ready]);

  const deviceOptions = (list: MediaDeviceInfo[]) =>
    list.map((d, i) => ({ value: d.deviceId, label: d.label || `Device ${i + 1}` }));

  return (
    <div className="mx-auto flex max-w-[640px] flex-col items-center gap-4 px-4 py-10">
      <h1 className="text-mainPage">Join {spaceName} community call</h1>
      <p className="flex items-center gap-1.5 text-metadata text-grey-04">
        {formatTimeRange(occurrence.startMs, occurrence.endMs)} · {formatFullDate(occurrence.startMs)} ·
        <GlobeIcon />
        {spaceName}
      </p>

      <div className="w-full rounded-lg border border-grey-02 p-4">
        <p className="mb-3 text-center text-metadata text-grey-04">
          This video will be posted online. Don’t share any private information.
        </p>

        {permissionError && <p className="mb-3 text-center text-metadata text-red-01">{permissionError}</p>}

        <div className="relative aspect-3/2 w-full overflow-hidden rounded-lg bg-grey-04">
          {videoEnabled ? (
            <video ref={videoRef} className="size-full object-cover" muted playsInline />
          ) : (
            <div className="flex size-full items-center justify-center text-white">Camera off</div>
          )}

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            <PreviewToggle
              on={audioEnabled}
              icon={<MicIcon muted={!audioEnabled} />}
              onLabel="Audio on"
              offLabel="Audio off"
              onClick={() => {
                setPermissionError(null);
                setAudioEnabled(v => !v);
              }}
            />
            <PreviewToggle
              on={videoEnabled}
              icon={<VideoIcon off={!videoEnabled} />}
              onLabel="Video on"
              offLabel="Video off"
              onClick={() => {
                setPermissionError(null);
                setVideoEnabled(v => !v);
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Select
            value={audioDeviceId}
            onChange={id => chooseInput('audio', id)}
            options={deviceOptions(devices.audio)}
            placeholder="Microphone"
            className="flex-1"
          />
          <Select
            value={videoDeviceId}
            onChange={id => chooseInput('video', id)}
            options={deviceOptions(devices.video)}
            placeholder="Camera"
            className="flex-1"
          />
          <Button
            variant="primary"
            disabled={joining || !initialDevices.ready}
            onClick={() => onJoin({ audioEnabled, videoEnabled, audioDeviceId, videoDeviceId })}
          >
            {joining ? 'Joining…' : 'Join community call'}
          </Button>
        </div>
        {canRememberCurrent && (
          <button
            type="button"
            className="mt-2 text-metadata text-grey-04 underline"
            onClick={() => {
              if (audioDeviceId) chooseInput('audio', audioDeviceId);
              if (videoDeviceId) chooseInput('video', videoDeviceId);
            }}
          >
            Remember current devices
          </button>
        )}
      </div>
    </div>
  );
}

function PreviewToggle({
  on,
  icon,
  onLabel,
  offLabel,
  onClick,
}: {
  on: boolean;
  icon: React.ReactNode;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg bg-black/80 px-5 py-2 text-footnoteMedium text-white"
    >
      {icon}
      {on ? onLabel : offLabel}
    </button>
  );
}
