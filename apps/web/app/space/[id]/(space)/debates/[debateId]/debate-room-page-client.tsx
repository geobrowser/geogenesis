'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

import type { Debate, DebateSide, LiveKitJoinResponse } from '~/core/debates/api';
import {
  useAbortDebate,
  useCompleteLocalRecordingUpload,
  useCreateLocalRecordingUpload,
  useDebate,
  useLiveKitJoin,
  useMarkDebateJoined,
} from '~/core/debates/hooks';
import { useFeatureFlag } from '~/core/state/feature-flags';

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

export function DebateRoomPageClient({ spaceId, debateId }: DebateRoomPageClientProps) {
  const debatesTabEnabled = useFeatureFlag('debatesTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!debatesTabEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [debatesTabEnabled, router, spaceId]);

  if (!debatesTabEnabled) return null;

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
  const [roomState, setRoomState] = React.useState<'idle' | 'connecting' | 'connected' | 'leaving'>('idle');
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteMediaRef = React.useRef<HTMLDivElement>(null);
  const roomRef = React.useRef<RoomLike | null>(null);
  const localTracksRef = React.useRef<LocalTrackLike[]>([]);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const recordingChunksRef = React.useRef<Blob[]>([]);
  const recordingStartedAtRef = React.useRef<number | null>(null);
  const debate = debateQuery.data ?? null;
  const remaining = useDebateCountdown(debate);

  const connect = async () => {
    setRoomError(null);
    setRoomState('connecting');

    try {
      const token = await liveKitJoin.mutateAsync();
      setJoinResponse(token);

      const livekit = await import('livekit-client');
      const room = new livekit.Room({ adaptiveStream: true, dynacast: true }) as unknown as RoomLike;
      room.on(livekit.RoomEvent.TrackSubscribed, track => {
        const element = track.attach();
        element.className = 'max-h-[320px] w-full rounded-lg bg-text object-contain';
        remoteMediaRef.current?.appendChild(element);
      });

      await room.connect(token.url, token.token);
      roomRef.current = room;
      const tracks = (await livekit.createLocalTracks({ audio: true, video: true })) as LocalTrackLike[];
      localTracksRef.current = tracks;
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
  };

  const leaveAndUpload = async () => {
    setRoomError(null);
    setRoomState('leaving');
    try {
      await stopLocalRecorderAndUpload(joinResponse?.side ?? null, createUpload, completeUpload);
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      setRoomState('idle');
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not upload the local recording.');
      setRoomState('connected');
    }
  };

  const abort = async () => {
    setRoomError(null);
    try {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
      await abortDebate.mutateAsync();
      router.push(`/space/${spaceId}/debates`);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : 'Could not abort the debate.');
    }
  };

  React.useEffect(() => {
    return () => {
      disconnectRoom(roomRef, localTracksRef, localVideoRef, remoteMediaRef);
    };
  }, []);

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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-grey-02 bg-white p-3">
                <Text as="div" variant="metadataMedium" color="grey-04" className="mb-2">
                  You
                </Text>
                <video ref={localVideoRef} className="aspect-video w-full rounded-lg bg-text object-cover" playsInline />
              </div>
              <div className="rounded-lg border border-grey-02 bg-white p-3">
                <Text as="div" variant="metadataMedium" color="grey-04" className="mb-2">
                  Other speaker
                </Text>
                <div ref={remoteMediaRef} className="min-h-[180px] space-y-2 rounded-lg bg-bg p-2" />
              </div>
            </div>

            {roomError && (
              <div className="rounded-lg border border-red-01 bg-white px-5 py-4">
                <Text color="red-01">{roomError}</Text>
              </div>
            )}
          </section>

          <aside className="rounded-lg border border-grey-02 bg-white p-4 shadow-light">
            <Text as="h3" variant="bodySemibold" color="text">
              {statusLabel(debate.status)}
            </Text>
            <Text as="p" variant="body" color="grey-04" className="mt-2">
              {speakerStatus(debate)}
            </Text>
            <div className="mt-4 rounded-md border border-grey-02 bg-bg px-3 py-2">
              <Text as="div" variant="metadataMedium" color="grey-04">
                Time
              </Text>
              <Text as="div" variant="smallTitle" color="text" className="mt-1">
                {remaining}
              </Text>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {roomState === 'idle' ? (
                <Button type="button" onClick={connect} disabled={liveKitJoin.isPending || markJoined.isPending}>
                  Join room
                </Button>
              ) : (
                <Button type="button" onClick={leaveAndUpload} disabled={roomState === 'leaving'}>
                  Leave and upload
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={abort} disabled={abortDebate.isPending}>
                Abort debate
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );

  function startLocalRecorder(stream: MediaStream) {
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
  }

  async function stopLocalRecorderAndUpload(
    side: DebateSide | null,
    uploadMutation: ReturnType<typeof useCreateLocalRecordingUpload>,
    completeMutation: ReturnType<typeof useCompleteLocalRecordingUpload>
  ) {
    const recorder = recorderRef.current;
    const startedAtMs = recordingStartedAtRef.current;
    if (!recorder || !startedAtMs || !side) return;

    const stopped = new Promise<void>(resolve => {
      recorder.onstop = () => resolve();
    });
    if (recorder.state !== 'inactive') {
      recorder.stop();
      await stopped;
    }

    const mimeType = recorder.mimeType || preferredRecordingMimeType() || 'video/webm';
    const blob = new Blob(recordingChunksRef.current, { type: mimeType });
    if (blob.size === 0) return;

    const upload = await uploadMutation.mutateAsync({ side, mime_type: mimeType, started_at_ms: startedAtMs });
    const uploadResponse = await fetch(upload.upload.url, {
      method: upload.upload.method,
      headers: upload.upload.headers,
      body: blob,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Recording upload failed (${uploadResponse.status})`);
    }
    const endedAtMs = Date.now();
    await completeMutation.mutateAsync({
      filename: upload.filename,
      mime_type: mimeType,
      started_at_ms: startedAtMs,
      ended_at_ms: endedAtMs,
      duration_seconds: Math.max(1, Math.round((endedAtMs - startedAtMs) / 1_000)),
      byte_size: blob.size,
    });
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

function useDebateCountdown(debate: Debate | null) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  const target = debate?.turn_ends_at ?? debate?.preflight_ends_at ?? debate?.prepare_ends_at ?? null;
  if (!target) return '00:00';
  const remainingMs = Math.max(0, new Date(target).getTime() - now);
  const seconds = Math.ceil(remainingMs / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function speakerStatus(debate: Debate) {
  if (debate.status === 'preparing') return 'Both speakers joined. Preparation is running.';
  if (debate.status === 'preflight') return 'Get ready. The first turn is about to start.';
  if (debate.status === 'in_progress' && debate.current_speaker_side) {
    const label =
      debate.current_speaker_side === 'for' ? debate.question.side_labels.for : debate.question.side_labels.against;
    return `${label} is speaking.`;
  }
  if (debate.status === 'thanking') return 'Wrap-up is running.';
  if (debate.status === 'complete') return 'Debate complete.';
  if (debate.status === 'cancelled') return 'Debate cancelled.';
  return 'Waiting for both speakers to join.';
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const mimeType of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return '';
}
