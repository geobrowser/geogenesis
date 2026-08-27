'use client';

import { usePreviewTracks } from '@livekit/components-react';

import * as React from 'react';

import { Track } from 'livekit-client';

import { formatFullDate, formatTimeRange } from '~/core/community-calls/format';
import { Occurrence } from '~/core/community-calls/types';

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
  const [audioDeviceId, setAudioDeviceId] = React.useState<string>();
  const [videoDeviceId, setVideoDeviceId] = React.useState<string>();
  const [devices, setDevices] = React.useState<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }>({
    audio: [],
    video: [],
  });
  const [permissionError, setPermissionError] = React.useState<string | null>(null);

  const tracks = usePreviewTracks(
    {
      audio: audioEnabled ? (audioDeviceId ? { deviceId: audioDeviceId } : true) : false,
      video: videoEnabled ? (videoDeviceId ? { deviceId: videoDeviceId } : true) : false,
    },
    err => {
      // Denied/dismissed browser permission — drop back to camera+mic off so we don't
      // join claiming a track that doesn't exist (that desync is what corrupts the
      // LiveKit grid layout once in the room).
      setAudioEnabled(false);
      setVideoEnabled(false);
      setPermissionError(
        err.name === 'NotAllowedError'
          ? 'Camera/microphone access was denied. You can still join without video.'
          : err.message
      );
    }
  );

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

  // Labels only populate once permission is granted (i.e. once a track exists).
  React.useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(list =>
      setDevices({
        audio: list.filter(d => d.kind === 'audioinput' && d.deviceId),
        video: list.filter(d => d.kind === 'videoinput' && d.deviceId),
      })
    );
  }, [tracks]);

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
            onChange={setAudioDeviceId}
            options={deviceOptions(devices.audio)}
            placeholder="Microphone"
            className="flex-1"
          />
          <Select
            value={videoDeviceId}
            onChange={setVideoDeviceId}
            options={deviceOptions(devices.video)}
            placeholder="Camera"
            className="flex-1"
          />
          <Button
            variant="primary"
            disabled={joining}
            onClick={() => onJoin({ audioEnabled, videoEnabled, audioDeviceId, videoDeviceId })}
          >
            {joining ? 'Joining…' : 'Join community call'}
          </Button>
        </div>
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
