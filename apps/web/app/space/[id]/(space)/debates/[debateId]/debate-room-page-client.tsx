'use client';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import type { Debate, DebateSide, LiveKitJoinResponse } from '~/core/debates/api';
import {
  oppositeSide,
  useAbortDebate,
  useCompleteLocalRecordingUpload,
  useCreateLocalRecordingUpload,
  useDebate,
  useLiveKitJoin,
  useMarkDebateJoined,
} from '~/core/debates/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button, SquareButton } from '~/design-system/button';
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

type RoomLike = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  localParticipant: {
    publishTrack: (track: unknown) => Promise<unknown>;
  };
  on: (event: string, callback: (track: { attach: () => HTMLElement }) => void) => void;
};

type DebateCountdown = {
  label: string;
  progress: number;
  activeSide: DebateSide | null;
};

const localRecordingUploadMaxAttempts = 3;
const localRecordingUploadRetryDelayMs = 1_000;

export function DebateRoomPageClient({ spaceId, debateId }: DebateRoomPageClientProps) {
  const questionsAndDebatesEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!questionsAndDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [questionsAndDebatesEnabled, router, spaceId]);

  if (!questionsAndDebatesEnabled) return null;

  return <DebateRoomSurface spaceId={spaceId} debateId={debateId} />;
}

function DebateRoomSurface({ spaceId, debateId }: DebateRoomPageClientProps) {
  const router = useRouter();
  const debateQuery = useDebate(debateId, true);
  const liveKitJoin = useLiveKitJoin(debateId);
  const markJoined = useMarkDebateJoined(debateId);
  const abortDebate = useAbortDebate(debateId);
  const createUpload = useCreateLocalRecordingUpload(debateId);
  const completeUpload = useCompleteLocalRecordingUpload(debateId);
  const [joinResponse, setJoinResponse] = React.useState<LiveKitJoinResponse | null>(null);
  const [roomState, setRoomState] = React.useState<'idle' | 'connecting' | 'connected' | 'uploading'>('idle');
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const [remoteVideoReady, setRemoteVideoReady] = React.useState(false);
  const [audioMuted, setAudioMuted] = React.useState(false);
  const [videoEnabled, setVideoEnabled] = React.useState(true);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteMediaRef = React.useRef<HTMLDivElement>(null);
  const roomRef = React.useRef<RoomLike | null>(null);
  const localTracksRef = React.useRef<LocalTrackLike[]>([]);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const autoConnectAttemptedRef = React.useRef<string | null>(null);
  const finalizedDebateRef = React.useRef<string | null>(null);
  const debate = debateQuery.data ?? null;
  const countdown = useDebateCountdown(debate);
  const questionsPath = `/space/${spaceId}/questions`;

  React.useEffect(() => {
    setLocalTrackPreferences(localTracksRef.current, { audioMuted, videoEnabled });
  }, [audioMuted, videoEnabled]);

  const startLocalRecorder = React.useCallback((stream: MediaStream) => {
    if (typeof MediaRecorder === 'undefined') return;
    const mimeType = preferredRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = Date.now();
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        recordingChunksRef.current.push(event.data);
      }
    };
    recorder.start(1_000);
    recorderRef.current = recorder;
  }, []);

  const stopLocalRecorderAndUpload = React.useCallback(
    async (side: DebateSide | null) => {
      const recorder = recorderRef.current;
      const startedAtMs = recordingStartedAtRef.current;
      if (!recorder || !startedAtMs || !side) return;

      const stopped = new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
      });
      if (recorder.state !== 'inactive') {
        recorder.requestData();
        recorder.stop();
        await stopped;
      }

      const mimeType = recorder.mimeType || preferredRecordingMimeType() || 'video/webm';
      const blob = new Blob(recordingChunksRef.current, { type: mimeType });
      if (blob.size === 0) return;

      let uploadedFilename: string | null = null;
      for (let attempt = 1; attempt <= localRecordingUploadMaxAttempts; attempt += 1) {
        try {
          const upload = await createUpload.mutateAsync({ side, mime_type: mimeType, started_at_ms: startedAtMs });
          const headers = new Headers(upload.upload.headers);
          headers.set('Content-Type', mimeType);
          const uploadResponse = await fetch(upload.upload.url, {
            method: upload.upload.method,
            headers,
            body: blob,
          });
          if (!uploadResponse.ok) {
            throw new Error(`Recording upload failed (${uploadResponse.status})`);
          }
          uploadedFilename = upload.filename;
          break;
        } catch (error) {
          if (attempt >= localRecordingUploadMaxAttempts) {
            throw error;
          }
          await delay(localRecordingUploadRetryDelayMs * attempt);
        }
      }
      if (!uploadedFilename) throw new Error('Recording upload failed.');

      const endedAtMs = Date.now();
      await completeUpload.mutateAsync({
        filename: uploadedFilename,
        mime_type: mimeType,
        started_at_ms: startedAtMs,
        ended_at_ms: endedAtMs,
        duration_seconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1_000)),
        byte_size: blob.size,
      });
    },
    [completeUpload, createUpload]
  );

  const discardLocalRecorder = React.useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const stopped = new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });
    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }
    recorderRef.current = null;
    recordingChunksRef.current = [];
    recordingStartedAtRef.current = null;
  }, []);

  const connect = React.useCallback(async () => {
    setRoomError(null);
    setRoomState('connecting');
    setRemoteVideoReady(false);
    remoteMediaRef.current?.replaceChildren();

    try {
      const token = await liveKitJoin.mutateAsync();
      setJoinResponse(token);

      const livekit = await import('livekit-client');
      const room = new livekit.Room({ adaptiveStream: true, dynacast: true }) as unknown as RoomLike;
      room.on(livekit.RoomEvent.TrackSubscribed, track => {
        const element = track.attach();
        if (element instanceof HTMLVideoElement) {
          element.className = 'h-full w-full object-contain';
          element.playsInline = true;
          setRemoteVideoReady(true);
        } else if (element instanceof HTMLAudioElement) {
          element.className = 'hidden';
        }
        remoteMediaRef.current?.appendChild(element);
      });

      await room.connect(token.url, token.token);
      roomRef.current = room;
      const tracks = (await livekit.createLocalTracks({ audio: true, video: true })) as LocalTrackLike[];
      localTracksRef.current = tracks;
      setLocalTrackPreferences(tracks, { audioMuted, videoEnabled });
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track);
      }

      const stream = new MediaStream(tracks.map(track => track.mediaStreamTrack));
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => undefined);
      }

      startLocalRecorder(stream);
      await markJoined.mutateAsync();
      setRoomState('connected');
    } catch (error) {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      setRoomError(error instanceof Error ? error.message : 'Could not join the debate room.');
      setRoomState('idle');
    }
  }, [audioMuted, liveKitJoin, markJoined, startLocalRecorder, videoEnabled]);

  const toggleAudioMuted = React.useCallback(() => {
    setAudioMuted(current => !current);
  }, []);

  const toggleVideoEnabled = React.useCallback(() => {
    setVideoEnabled(current => !current);
  }, []);

  const finishAndUpload = React.useCallback(async () => {
    setRoomError(null);
    setRoomState('uploading');
    try {
      await stopLocalRecorderAndUpload(joinResponse?.side ?? null);
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      setRemoteVideoReady(false);
      setRoomState('idle');
      return true;
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not upload the local recording.');
      setRoomState('connected');
      return false;
    }
  }, [joinResponse?.side, stopLocalRecorderAndUpload]);

  const leave = React.useCallback(async () => {
    if (!debate) return;
    setRoomError(null);
    try {
      if (debate.status === 'complete') {
        const uploaded = await finishAndUpload();
        if (!uploaded) return;
      } else if (debate.status === 'cancelled') {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        setRemoteVideoReady(false);
        setRoomState('idle');
      } else {
        await discardLocalRecorder();
        disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
        setRemoteVideoReady(false);
        await abortDebate.mutateAsync();
      }
      router.push(debate.status === 'complete' ? questionsPath : `/space/${spaceId}/debates`);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not leave the debate.');
    }
  }, [abortDebate, debate, discardLocalRecorder, finishAndUpload, questionsPath, router, spaceId]);

  React.useEffect(() => {
    return () => {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    };
  }, []);

  React.useEffect(() => {
    if (!debate || roomState !== 'idle') return;
    if (['complete', 'cancelled'].includes(debate.status)) return;
    if (autoConnectAttemptedRef.current === debate.id) return;
    autoConnectAttemptedRef.current = debate.id;
    void connect();
  }, [connect, debate, roomState]);

  React.useEffect(() => {
    if (!debate) return;
    if (debate.status === 'complete' && roomState === 'idle') {
      router.replace(questionsPath);
      return;
    }
    if (roomState === 'idle') return;
    if (debate.status === 'cancelled') {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      setRemoteVideoReady(false);
      setRoomState('idle');
      return;
    }
    if (debate.status !== 'complete') return;
    if (finalizedDebateRef.current === debate.id) return;
    finalizedDebateRef.current = debate.id;
    void finishAndUpload().then(uploaded => {
      if (uploaded) router.replace(questionsPath);
    });
  }, [debate, finishAndUpload, questionsPath, roomState, router]);

  if (debate?.status === 'complete' && roomState === 'idle') return null;

  return (
    <div className="py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Text as="h2" variant="smallTitle" color="text">
            Debate room
          </Text>
          {debate && (
            <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[760px]">
              {debate.question.question}
            </Text>
          )}
        </div>
        <Button type="button" variant="secondary" onClick={() => router.push(`/space/${spaceId}/debates`)}>
          Back to debates
        </Button>
      </div>

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

      {debate && (
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
                        {participant.display_name || participant.profile_space_id} ·{' '}
                        {labelForSide(participant.side, debate.question.side_labels)}
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
              localSide={joinResponse?.side ?? null}
              localVideoRef={localVideoRef}
              remoteMediaRef={remoteMediaRef}
              remoteVideoReady={remoteVideoReady}
              audioMuted={audioMuted}
              videoEnabled={videoEnabled}
              onToggleAudioMuted={toggleAudioMuted}
              onToggleVideoEnabled={toggleVideoEnabled}
              onLeave={leave}
              leaveDisabled={abortDebate.isPending || roomState === 'uploading'}
            />
          )}
        </>
      )}
    </div>
  );
}

function DebateRecordingModal({
  debate,
  roomState,
  roomError,
  countdown,
  localSide,
  localVideoRef,
  remoteMediaRef,
  remoteVideoReady,
  audioMuted,
  videoEnabled,
  onToggleAudioMuted,
  onToggleVideoEnabled,
  onLeave,
  leaveDisabled,
}: {
  debate: Debate;
  roomState: 'connecting' | 'connected' | 'uploading';
  roomError: string | null;
  countdown: DebateCountdown;
  localSide: DebateSide | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteMediaRef: React.RefObject<HTMLDivElement | null>;
  remoteVideoReady: boolean;
  audioMuted: boolean;
  videoEnabled: boolean;
  onToggleAudioMuted: () => void;
  onToggleVideoEnabled: () => void;
  onLeave: () => void;
  leaveDisabled: boolean;
}) {
  const remoteSide = localSide ? oppositeSide(localSide) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Debate recording"
      className="fixed inset-0 z-[1000] flex h-dvh flex-col overflow-hidden bg-bg text-text"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-grey-02 bg-white px-4 py-3 shadow-light">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Text as="h2" variant="bodySemibold" color="text">
              {statusLabel(debate.status)}
            </Text>
            <span className="rounded-full border border-grey-02 bg-bg px-2 py-0.5 text-[0.75rem] leading-4 text-grey-04">
              {roomStateLabel(roomState)}
            </span>
          </div>
          <Text as="p" variant="metadata" color="grey-04" className="mt-1 line-clamp-2 max-w-[920px]">
            {debate.question.question}
          </Text>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <SquareButton
            type="button"
            aria-label={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={audioMuted ? 'Unmute microphone' : 'Mute microphone'}
            className="h-[34px] w-[34px] shrink-0"
            icon={<MicrophoneIcon muted={audioMuted} />}
            isActive={audioMuted}
            onClick={onToggleAudioMuted}
            disabled={roomState === 'uploading'}
          />
          <SquareButton
            type="button"
            aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
            className="h-[34px] w-[34px] shrink-0"
            icon={<CameraIcon disabled={!videoEnabled} />}
            isActive={!videoEnabled}
            onClick={onToggleVideoEnabled}
            disabled={roomState === 'uploading'}
          />
          <Button
            type="button"
            variant={['complete', 'cancelled'].includes(debate.status) ? 'secondary' : 'error'}
            onClick={onLeave}
            disabled={leaveDisabled}
          >
            {roomState === 'uploading' ? 'Uploading...' : 'Leave debate'}
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,1fr)_auto_minmax(180px,1fr)] gap-3">
          <DebateVideoTile
            title="You"
            sideLabel={localSide ? labelForSide(localSide, debate.question.side_labels) : 'Joining'}
            active={countdown.activeSide !== null && countdown.activeSide === localSide}
            overlayText={videoEnabled ? null : 'Camera off'}
          >
            <video ref={localVideoRef} className="h-full w-full bg-grey-01 object-contain" playsInline muted autoPlay />
          </DebateVideoTile>

          <DebateInstructionBand debate={debate} countdown={countdown} />

          <DebateVideoTile
            title="Other speaker"
            sideLabel={remoteSide ? labelForSide(remoteSide, debate.question.side_labels) : 'Connecting'}
            active={countdown.activeSide !== null && countdown.activeSide === remoteSide}
            overlayText={remoteVideoReady ? null : 'Waiting for video'}
          >
            <div
              ref={remoteMediaRef}
              className="h-full w-full bg-grey-01 [&>audio]:hidden [&>video]:h-full [&>video]:w-full [&>video]:bg-grey-01 [&>video]:object-contain"
            />
          </DebateVideoTile>
        </div>

        {roomError && (
          <div className="shrink-0 rounded-lg border border-red-01 bg-white px-4 py-3">
            <Text color="red-01">{roomError}</Text>
          </div>
        )}
      </main>
    </div>
  );
}

function DebateVideoTile({
  title,
  sideLabel,
  active,
  overlayText,
  children,
}: {
  title: string;
  sideLabel: string;
  active: boolean;
  overlayText?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cx(
        'relative min-h-0 overflow-hidden rounded-lg border bg-white shadow-card',
        active ? 'border-text' : 'border-grey-02'
      )}
    >
      <div className="absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2">
        <span className="rounded-full border border-grey-02 bg-white/90 px-3 py-1 text-[0.8125rem] leading-4 font-medium text-text shadow-light backdrop-blur">
          {title}
        </span>
        <span className="min-w-0 truncate rounded-full bg-bg px-3 py-1 text-[0.8125rem] leading-4 text-grey-04 shadow-light">
          {sideLabel}
        </span>
      </div>

      <div className="absolute inset-0 z-0">{children}</div>

      {overlayText && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <Text
            color="text"
            variant="bodySemibold"
            className="rounded-full border border-grey-02 bg-white px-4 py-2 shadow-light"
          >
            {overlayText}
          </Text>
        </div>
      )}
    </section>
  );
}

function DebateInstructionBand({ debate, countdown }: { debate: Debate; countdown: DebateCountdown }) {
  const remainingPercent = `${Math.round((1 - countdown.progress) * 100)}%`;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white px-4 py-3 shadow-light">
      <div className="min-w-0">
        <Text as="p" variant="bodySemibold" color="text">
          {speakerStatus(debate)}
        </Text>
        <Text as="p" variant="metadata" color="grey-04" className="mt-1">
          {debate.status === 'thanking'
            ? 'Both speakers can talk during the wrap-up.'
            : countdown.activeSide
              ? `${labelForSide(countdown.activeSide, debate.question.side_labels)} has the floor.`
              : 'Get ready.'}
        </Text>
      </div>
      <div className="w-[min(220px,100%)] shrink-0 rounded-full bg-bg px-4 py-2 text-center text-text shadow-inner shadow-grey-02">
        <Text as="div" variant="smallTitle" color="text">
          {countdown.label}
        </Text>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-grey-02">
          <div
            className="h-full rounded-full bg-text transition-[width] duration-500"
            style={{ width: remainingPercent }}
          />
        </div>
      </div>
    </div>
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

function CameraIcon({ disabled }: { disabled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M16 10l5-3v10l-5-3" />
      {disabled && <path d="M3 3l18 18" />}
    </svg>
  );
}

function setLocalTrackPreferences(
  tracks: LocalTrackLike[],
  preferences: { audioMuted: boolean; videoEnabled: boolean }
) {
  for (const track of tracks) {
    if (track.mediaStreamTrack.kind === 'audio') {
      track.mediaStreamTrack.enabled = !preferences.audioMuted;
    }
    if (track.mediaStreamTrack.kind === 'video') {
      track.mediaStreamTrack.enabled = preferences.videoEnabled;
    }
  }
}

function disconnectRoom(
  roomRef: React.MutableRefObject<RoomLike | null>,
  localTracksRef: React.MutableRefObject<LocalTrackLike[]>,
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  remoteMediaRef: React.RefObject<HTMLDivElement | null>
) {
  for (const track of localTracksRef.current) {
    track.detach?.();
    track.stop();
  }
  localTracksRef.current = [];
  roomRef.current?.disconnect();
  roomRef.current = null;
  if (localVideoRef.current) {
    localVideoRef.current.srcObject = null;
  }
  if (remoteMediaRef.current) {
    remoteMediaRef.current.replaceChildren();
  }
}

function useDebateCountdown(debate: Debate | null): DebateCountdown {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const countdownWindow = debate ? countdownWindowForDebate(debate) : null;
  if (!countdownWindow?.target) {
    return { label: '00:00', progress: 0, activeSide: null };
  }

  const targetMs = new Date(countdownWindow.target).getTime();
  const startMs = countdownWindow.start ? new Date(countdownWindow.start).getTime() : null;
  const remainingMs = Math.max(0, targetMs - now);
  const seconds = Math.ceil(remainingMs / 1_000);
  const totalMs = startMs ? Math.max(1, targetMs - startMs) : 0;
  const elapsedMs = startMs ? Math.min(totalMs, Math.max(0, now - startMs)) : 0;

  return {
    label: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    progress: totalMs === 0 ? 0 : elapsedMs / totalMs,
    activeSide: countdownWindow.activeSide,
  };
}

function countdownWindowForDebate(debate: Debate): {
  start: string | null;
  target: string | null;
  activeSide: DebateSide | null;
} {
  if (debate.status === 'preparing') {
    return {
      start: debate.prepare_started_at,
      target: debate.prepare_ends_at,
      activeSide: null,
    };
  }

  if (debate.status === 'preflight') {
    return {
      start: debate.prepare_ends_at,
      target: debate.preflight_ends_at,
      activeSide: debate.first_side,
    };
  }

  if (debate.status === 'in_progress') {
    return {
      start: debate.turn_started_at,
      target: debate.turn_ends_at,
      activeSide: debate.current_speaker_side,
    };
  }

  if (debate.status === 'thanking') {
    return {
      start: debate.turn_started_at,
      target: debate.turn_ends_at,
      activeSide: null,
    };
  }

  return {
    start: null,
    target: null,
    activeSide: null,
  };
}

function speakerStatus(debate: Debate) {
  if (debate.status === 'preparing') return 'Both speakers joined. Preparation is running.';
  if (debate.status === 'preflight') return 'Get ready. The first turn is about to start.';
  if (debate.status === 'in_progress' && debate.current_speaker_side) {
    const label =
      debate.current_speaker_side === 'for' ? debate.question.side_labels.for : debate.question.side_labels.against;
    return `${label} is speaking.`;
  }
  if (debate.status === 'thanking') return 'Wrap-up is running. Both speakers can thank each other.';
  if (debate.status === 'complete') return 'Debate complete.';
  if (debate.status === 'cancelled') return 'Debate cancelled.';
  return 'Waiting for both speakers to join.';
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function roomStateLabel(roomState: 'connecting' | 'connected' | 'uploading') {
  if (roomState === 'connecting') return 'Connecting';
  if (roomState === 'uploading') return 'Uploading';
  return 'Recording';
}

function labelForSide(side: DebateSide, labels: { for: string; against: string }) {
  return side === 'for' ? labels.for : labels.against;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}
