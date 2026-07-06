'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import type { Debate, ParticipantSlot } from '~/core/debates/api';
import { useRecordingUrl, useSpaceDebates } from '~/core/debates/hooks';
import { DebateMatchPrompt } from '~/core/debates/match-prompt';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { Button, SquareButton } from '~/design-system/button';
import { Close } from '~/design-system/icons/close';
import { Text } from '~/design-system/text';

type DebatesPageClientProps = {
  spaceId: string;
};

export function DebatesPageClient({ spaceId }: DebatesPageClientProps) {
  const questionsAndDebatesEnabled = useFeatureFlag('questionsTab');
  const router = useRouter();

  React.useEffect(() => {
    if (!questionsAndDebatesEnabled) {
      router.replace(`/space/${spaceId}`);
    }
  }, [questionsAndDebatesEnabled, router, spaceId]);

  if (!questionsAndDebatesEnabled) return null;

  return <DebatesTabSurface spaceId={spaceId} />;
}

function DebatesTabSurface({ spaceId }: DebatesPageClientProps) {
  const debatesQuery = useSpaceDebates(spaceId, true);
  const matches = debatesQuery.data?.matches ?? [];
  const debates = debatesQuery.data?.debates ?? [];
  const recordedDebates = debates.filter(isWatchableDebate);
  const [selectedDebate, setSelectedDebate] = React.useState<Debate | null>(null);

  return (
    <div className="py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Text as="h2" variant="smallTitle" color="text">
          Debates
        </Text>
      </div>

      {debatesQuery.isLoading && matches.length === 0 && recordedDebates.length === 0 && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text color="grey-04">Loading debates...</Text>
        </div>
      )}

      {debatesQuery.error instanceof Error && (
        <div className="rounded-lg border border-red-01 bg-white px-5 py-4">
          <Text color="red-01">{debatesQuery.error.message}</Text>
        </div>
      )}

      {!debatesQuery.isLoading && matches.length === 0 && recordedDebates.length === 0 && (
        <div className="rounded-lg border border-grey-02 bg-white px-5 py-6">
          <Text as="h3" variant="bodySemibold" color="text">
            No debates yet
          </Text>
          <Text as="p" variant="body" color="grey-04" className="mt-2 max-w-[560px]">
            Start from a published question by choosing an answer on the Questions tab.
          </Text>
        </div>
      )}

      <div className="space-y-4">
        {recordedDebates.length > 0 && (
          <section>
            <Text as="h3" variant="bodySemibold" color="text" className="mb-2 block">
              Space debates
            </Text>
            <div className="space-y-3">
              {recordedDebates.map(debate => (
                <DebateCard key={debate.id} debate={debate} onWatch={() => setSelectedDebate(debate)} />
              ))}
            </div>
          </section>
        )}
      </div>
      {selectedDebate && <DebatePlaybackDialog debate={selectedDebate} onClose={() => setSelectedDebate(null)} />}
      <DebateMatchPrompt spaceId={spaceId} matches={matches} debates={debates} />
    </div>
  );
}

function DebateCard({ debate, onWatch }: { debate: Debate; onWatch: () => void }) {
  const participants = orderedParticipants(debate);

  return (
    <article className="max-md:grid max-md:grid-cols-1 max-md:items-stretch flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white p-3 shadow-light">
      <div className="max-md:min-w-0 grid min-w-[220px] gap-1">
        <div className="min-w-0">
          <Text as="h3" variant="bodySemibold" color="text" className="block">
            {debate.question.question}
          </Text>
          <Text as="p" variant="metadata" color="grey-04" className="mt-1">
            {statusLabel(debate.status)} · {formatDate(debate.completed_at ?? debate.started_at ?? debate.created_at)}
          </Text>
        </div>
      </div>
      <dl className="max-md:grid max-md:min-w-0 max-md:grid-cols-2 max-md:justify-stretch max-md:gap-x-4 max-md:gap-y-3 m-0 flex min-w-[280px] flex-1 items-center justify-end gap-3">
        {participants.map(participant => (
          <ParticipantTerm key={participant.user_id} label={participant.answer.label} name={speakerLabel(participant)} />
        ))}
        <div className="grid min-w-[76px] gap-0.5">
          <dt className="text-xs text-grey-04">Recordings</dt>
          <dd className="m-0 text-xs text-text">{debate.recordings.length}</dd>
        </div>
        <div className="grid min-w-[76px] gap-0.5">
          <dt className="text-xs text-grey-04">Format</dt>
          <dd className="m-0 text-xs text-text">{debate.turn_durations_ms.length} turns</dd>
        </div>
      </dl>
      <Button type="button" variant="secondary" small className="max-md:w-full" onClick={onWatch}>
        Watch
      </Button>
    </article>
  );
}

function ParticipantTerm({ label, name }: { label: string; name: string }) {
  return (
    <div className="grid min-w-[76px] gap-0.5">
      <dt className="text-xs text-grey-04">{label}</dt>
      <dd className="m-0 text-xs text-text">{name}</dd>
    </div>
  );
}

function DebatePlaybackDialog({ debate, onClose }: { debate: Debate; onClose: () => void }) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="max-sm:p-0 fixed inset-0 z-[1300] flex items-center justify-center bg-text/20 p-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="debate-playback-title"
        className="max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none flex h-[min(760px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[min(520px,100%)] flex-col overflow-hidden rounded-lg border border-grey-02 bg-white text-text shadow-card"
      >
        <header className="flex min-w-0 items-start justify-between gap-3 border-b border-grey-02 px-4 py-3">
          <div className="min-w-0">
            <Text as="div" variant="metadataMedium" color="grey-04" className="uppercase">
              Recorded debate
            </Text>
            <h2
              id="debate-playback-title"
              className="mt-1 block truncate text-[0.9375rem] leading-5 font-semibold text-text"
            >
              {debate.question.question}
            </h2>
          </div>
          <SquareButton type="button" icon={<Close />} aria-label="Close playback" onClick={onClose} />
        </header>
        <DebatePlayback debate={debate} />
      </section>
    </div>
  );
}

type PlaybackUrls = {
  slot1: string | null;
  slot2: string | null;
};

type TurnState = {
  slot: ParticipantSlot;
  progress: number;
  seconds: number;
} | null;

function DebatePlayback({ debate }: { debate: Debate }) {
  const recordingUrlMutation = useRecordingUrl();
  const [urls, setUrls] = React.useState<PlaybackUrls>({ slot1: null, slot2: null });
  const [error, setError] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  const [mutedByUser, setMutedByUser] = React.useState(false);
  const [playheadSeconds, setPlayheadSeconds] = React.useState(0);
  const [turnState, setTurnState] = React.useState<TurnState>(null);
  const slot1VideoRef = React.useRef<HTMLVideoElement | null>(null);
  const slot2VideoRef = React.useRef<HTMLVideoElement | null>(null);
  const pendingSeekSecondsRef = React.useRef<number | null>(null);
  const getRecordingPlaybackUrlRef = React.useRef(recordingUrlMutation.mutateAsync);
  const turnDurations = React.useMemo(
    () => normalizeTurnDurationsMs(debate.turn_durations_ms),
    [debate.turn_durations_ms]
  );
  const timelineSeconds = React.useMemo(() => timelineSecondsFor(turnDurations), [turnDurations]);
  const turnSegments = React.useMemo(
    () => turnSegmentsFor(debate.first_participant_slot, turnDurations),
    [debate.first_participant_slot, turnDurations]
  );
  const slot1Participant = debate.participants.find(participant => participant.participant_slot === 1);
  const slot2Participant = debate.participants.find(participant => participant.participant_slot === 2);
  const slot1RecordingFilename =
    debate.recordings.find(recording => recording.participant_slot === 1)?.filename ?? null;
  const slot2RecordingFilename =
    debate.recordings.find(recording => recording.participant_slot === 2)?.filename ?? null;

  React.useEffect(() => {
    getRecordingPlaybackUrlRef.current = recordingUrlMutation.mutateAsync;
  }, [recordingUrlMutation.mutateAsync]);

  React.useEffect(() => {
    let cancelled = false;
    setUrls({ slot1: null, slot2: null });
    setError(null);
    if (!slot1RecordingFilename || !slot2RecordingFilename) {
      setError('This debate needs both recordings before it can be watched.');
      return;
    }

    Promise.all([
      getRecordingPlaybackUrlRef.current({ debateId: debate.id, filename: slot1RecordingFilename }),
      getRecordingPlaybackUrlRef.current({ debateId: debate.id, filename: slot2RecordingFilename }),
    ])
      .then(([slot1Result, slot2Result]) => {
        if (!cancelled) setUrls({ slot1: slot1Result.url, slot2: slot2Result.url });
      })
      .catch(caught => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load recordings.');
      });

    return () => {
      cancelled = true;
    };
  }, [debate.id, slot1RecordingFilename, slot2RecordingFilename]);

  const videos = React.useCallback(
    () => [slot1VideoRef.current, slot2VideoRef.current].filter((video): video is HTMLVideoElement => video !== null),
    []
  );

  const seekVideosTo = React.useCallback(
    (seconds: number) => {
      const activeVideos = videos();
      const ready = activeVideos.length === 2 && activeVideos.every(video => Number.isFinite(video.duration));
      if (!ready) return false;
      for (const video of activeVideos) {
        video.currentTime = seconds;
      }
      return true;
    },
    [videos]
  );

  const updateTurnState = React.useCallback(() => {
    const activeVideos = videos();
    const [primaryVideo, secondaryVideo] = activeVideos;
    const pendingSeekSeconds = pendingSeekSecondsRef.current;
    if (pendingSeekSeconds !== null && seekVideosTo(pendingSeekSeconds)) {
      pendingSeekSecondsRef.current = null;
    }

    const currentTime = primaryVideo?.currentTime ?? 0;
    setPlayheadSeconds(clampSeconds(currentTime, timelineSeconds));
    if (
      primaryVideo &&
      secondaryVideo &&
      !primaryVideo.paused &&
      !secondaryVideo.seeking &&
      Math.abs(secondaryVideo.currentTime - currentTime) > 0.18
    ) {
      secondaryVideo.currentTime = currentTime;
    }

    if (!primaryVideo || primaryVideo.paused || primaryVideo.ended || currentTime >= timelineSeconds) {
      if (currentTime >= timelineSeconds) setPlaying(false);
      setTurnState(null);
      return;
    }

    setTurnState(turnStateForTime(debate.first_participant_slot, turnDurations, currentTime));
  }, [debate.first_participant_slot, seekVideosTo, timelineSeconds, turnDurations, videos]);

  const pauseBoth = React.useCallback(() => {
    for (const video of videos()) video.pause();
    setPlaying(false);
    setUserPaused(true);
    setTurnState(null);
  }, [videos]);

  const resumeBoth = React.useCallback(async () => {
    const activeVideos = videos();
    if (activeVideos.length !== 2) return;
    setError(null);
    try {
      await Promise.all(activeVideos.map(video => video.play()));
      setPlaying(true);
      setUserPaused(false);
    } catch {
      for (const video of activeVideos) video.pause();
      setPlaying(false);
      setTurnState(null);
      setError('Could not play both videos. Try Play again.');
    }
  }, [videos]);

  const playFromStart = React.useCallback(async () => {
    const activeVideos = videos();
    if (activeVideos.length !== 2) return;
    setError(null);
    setUserPaused(false);
    setPlayheadSeconds(0);
    pendingSeekSecondsRef.current = null;
    for (const video of activeVideos) {
      video.pause();
      video.currentTime = 0;
      video.muted = mutedByUser;
    }
    await resumeBoth();
  }, [mutedByUser, resumeBoth, videos]);

  const seekBoth = React.useCallback(
    (seconds: number) => {
      const nextTime = clampSeconds(seconds, timelineSeconds);
      pendingSeekSecondsRef.current = nextTime;
      if (seekVideosTo(nextTime)) pendingSeekSecondsRef.current = null;
      setPlayheadSeconds(nextTime);
      setTurnState(turnStateForTime(debate.first_participant_slot, turnDurations, nextTime));
      window.requestAnimationFrame(updateTurnState);
    },
    [debate.first_participant_slot, seekVideosTo, timelineSeconds, turnDurations, updateTurnState]
  );

  const ready = Boolean(urls.slot1 && urls.slot2);
  const playbackEnded = ready && timelineSeconds > 0 && playheadSeconds >= timelineSeconds - 0.05;

  const togglePlayback = () => {
    if (playing) {
      pauseBoth();
      return;
    }
    if (playbackEnded) {
      void playFromStart();
      return;
    }
    void resumeBoth();
  };

  const showStartOverlay = ready && !playing && !userPaused && playheadSeconds === 0;
  const showPausedOverlay = ready && !playing && (userPaused || playbackEnded) && !showStartOverlay;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-bg">
      <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] place-items-center gap-2 overflow-hidden px-2 py-3">
        <PlaybackPane
          slot={1}
          label={slot1Participant?.answer.label ?? 'Answer'}
          name={slot1Participant ? speakerLabel(slot1Participant) : 'Answer'}
          src={urls.slot1}
          countdown={turnState?.slot === 1 ? turnState : null}
          mutedByTurn={playing && turnState?.slot === 2}
          mutedByUser={mutedByUser}
          videoRef={slot1VideoRef}
          onEnded={updateTurnState}
          onPlaybackTick={updateTurnState}
          onClick={togglePlayback}
        />
        <PlaybackPane
          slot={2}
          label={slot2Participant?.answer.label ?? 'Answer'}
          name={slot2Participant ? speakerLabel(slot2Participant) : 'Answer'}
          src={urls.slot2}
          countdown={turnState?.slot === 2 ? turnState : null}
          mutedByTurn={playing && turnState?.slot === 1}
          mutedByUser={mutedByUser}
          videoRef={slot2VideoRef}
          onEnded={updateTurnState}
          onPlaybackTick={updateTurnState}
          onClick={togglePlayback}
        />
        {showStartOverlay && (
          <button
            type="button"
            className="absolute inset-0 z-30 grid place-items-center bg-white/10 text-white"
            onClick={playFromStart}
          >
            <span className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 bg-text/60 px-5 text-[0.9375rem] leading-5 font-semibold shadow-card backdrop-blur-md">
              Play debate
            </span>
          </button>
        )}
        {showPausedOverlay && (
          <button
            type="button"
            className="absolute inset-0 z-30 grid place-items-center bg-white/10 text-white"
            onClick={togglePlayback}
          >
            <span className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/35 bg-text/60 px-5 text-[0.9375rem] leading-5 font-semibold shadow-card backdrop-blur-md">
              {playbackEnded ? 'Play again' : 'Play'}
            </span>
          </button>
        )}
      </div>

      <div className="border-t border-grey-02 bg-white px-4 py-3">
        <div className="mx-auto w-[min(100%,386px)]">
          <div className="flex items-center justify-between gap-3">
            <Text as="span" variant="metadataMedium" color="text">
              {turnState ? `${labelForSlot(debate, turnState.slot)} speaking` : 'Debate playback'}
            </Text>
            <Text as="span" variant="metadataMedium" color="text">
              {formatSeconds(playheadSeconds)} / {formatSeconds(timelineSeconds)}
            </Text>
          </div>
          <FeedScrubber
            currentTime={playheadSeconds}
            duration={timelineSeconds}
            segments={turnSegments}
            disabled={!ready}
            onSeek={seekBoth}
          />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              small
              disabled={!ready}
              onClick={() => setMutedByUser(current => !current)}
            >
              {mutedByUser ? 'Unmute' : 'Mute'}
            </Button>
            <Button type="button" small disabled={!ready} onClick={showStartOverlay ? playFromStart : togglePlayback}>
              {playing ? 'Pause' : playbackEnded ? 'Play again' : playheadSeconds > 0 ? 'Play' : 'Play debate'}
            </Button>
          </div>
          <div className="mt-2">
            {error ? (
              <Text color="red-01">{error}</Text>
            ) : !ready ? (
              <Text color="grey-04">Loading recordings...</Text>
            ) : (
              <Text color="grey-04">Tap a video to pause or resume. Drag the timeline to seek.</Text>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaybackPane({
  slot,
  label,
  name,
  src,
  countdown,
  mutedByTurn,
  mutedByUser,
  videoRef,
  onEnded,
  onPlaybackTick,
  onClick,
}: {
  slot: ParticipantSlot;
  label: string;
  name: string;
  src: string | null;
  countdown: TurnState;
  mutedByTurn: boolean;
  mutedByUser: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onEnded: () => void;
  onPlaybackTick: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`relative grid h-full min-h-0 w-[min(100%,386px)] overflow-hidden rounded-lg border bg-grey-01 text-left text-white shadow-light ${
        countdown ? 'border-ctaPrimary' : 'border-grey-02'
      }`}
      onClick={onClick}
    >
      {src ? (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover ${mutedByTurn ? 'brightness-90 saturate-[0.9]' : ''}`}
          playsInline
          preload="metadata"
          src={src}
          muted={mutedByTurn || mutedByUser}
          onEnded={onEnded}
          onLoadedMetadata={onPlaybackTick}
          onPause={onPlaybackTick}
          onPlay={onPlaybackTick}
          onTimeUpdate={onPlaybackTick}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-bg text-grey-04">Loading...</div>
      )}
      {mutedByTurn && <div className="pointer-events-none absolute inset-0 z-[2] bg-white/15" aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[90px] bg-linear-to-b from-black/0 to-black opacity-90" />
      {countdown && <CountdownBadge progress={countdown.progress} seconds={countdown.seconds} slot={slot} />}
      <div className="absolute right-4 bottom-4 left-4 z-[4] flex min-w-0 items-center gap-2">
        <span className="block min-w-0 truncate text-sm font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
          {name}
        </span>
        <span
          className={`inline-flex min-h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium text-text ${
            slot === 1 ? 'bg-[#5be28b]' : 'bg-[#ff6b6b]'
          }`}
        >
          {label}
        </span>
      </div>
    </button>
  );
}

function CountdownBadge({ progress, seconds, slot }: { progress: number; seconds: number; slot: ParticipantSlot }) {
  const degrees = Math.max(0, Math.min(1, progress)) * 360;
  const color = slot === 1 ? '#5be28b' : '#ff6b6b';
  return (
    <div
      className="absolute top-3 right-3 z-[5] grid size-12 place-items-center rounded-full bg-text/65 text-sm font-semibold text-white shadow-card"
      style={{ backgroundImage: `conic-gradient(${color} ${degrees}deg, rgba(255,255,255,0.28) 0deg)` }}
    >
      <span className="grid size-10 place-items-center rounded-full bg-text/80">{Math.ceil(seconds)}</span>
    </div>
  );
}

function FeedScrubber({
  currentTime,
  duration,
  segments,
  disabled,
  onSeek,
}: {
  currentTime: number;
  duration: number;
  segments: readonly TurnSegment[];
  disabled: boolean;
  onSeek: (seconds: number) => void;
}) {
  const boundedCurrentTime = clampSeconds(currentTime, duration);
  const progress = duration > 0 ? (boundedCurrentTime / duration) * 100 : 0;
  let elapsedSeconds = 0;

  return (
    <div className="relative mt-2 flex h-6 items-center [--thumb-size:12px] [--track-height:5px]">
      <div className="absolute inset-x-0 top-1/2 flex h-[var(--track-height)] -translate-y-1/2 gap-1">
        {segments.map(segment => {
          const segmentStart = elapsedSeconds;
          const elapsedInSegment = clampSeconds(boundedCurrentTime - segmentStart, segment.durationSeconds);
          const segmentProgress = segment.durationSeconds > 0 ? (elapsedInSegment / segment.durationSeconds) * 100 : 0;
          elapsedSeconds += segment.durationSeconds;
          return (
            <span
              key={`${segment.slot}-${segment.index}`}
              className="relative h-[var(--track-height)] min-w-2.5 basis-0 overflow-hidden rounded-full bg-divider"
              style={{ flexGrow: segment.durationSeconds }}
            >
              <span
                className={`absolute inset-y-0 left-0 rounded-[inherit] ${
                  segment.slot === 1 ? 'bg-[#5be28b]' : 'bg-[#ff6b6b]'
                }`}
                style={{ width: `${segmentProgress}%` }}
              />
            </span>
          );
        })}
        <span
          className="pointer-events-none absolute top-1/2 z-[2] size-[var(--thumb-size)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)]"
          style={{ left: `${progress}%` }}
        />
      </div>
      <input
        className="absolute inset-0 z-[4] m-0 h-6 w-full cursor-pointer appearance-none rounded-none border-0 bg-transparent p-0 text-transparent opacity-0 outline-none disabled:cursor-default"
        type="range"
        min="0"
        max={duration > 0 ? duration : 1}
        step="0.05"
        value={boundedCurrentTime}
        disabled={disabled || duration <= 0}
        aria-label="Debate timeline"
        onInput={event => onSeek(Number(event.currentTarget.value))}
        onChange={event => onSeek(Number(event.currentTarget.value))}
      />
    </div>
  );
}

type TurnSegment = {
  slot: ParticipantSlot;
  index: number;
  durationSeconds: number;
};

function isWatchableDebate(debate: Debate) {
  return (
    debate.status === 'complete' &&
    debate.recordings.some(recording => recording.participant_slot === 1) &&
    debate.recordings.some(recording => recording.participant_slot === 2)
  );
}

function normalizeTurnDurationsMs(values: number[]) {
  const normalized = values.filter(value => Number.isFinite(value) && value > 0);
  return normalized.length > 0 ? normalized : [30_000, 30_000];
}

function timelineSecondsFor(turnDurationsMs: number[]) {
  return turnDurationsMs.reduce((sum, value) => sum + value / 1_000, 0);
}

function turnSegmentsFor(firstSlot: ParticipantSlot, turnDurationsMs: number[]): TurnSegment[] {
  return turnDurationsMs.map((durationMs, index) => ({
    slot: turnSlot(firstSlot, index),
    index,
    durationSeconds: Math.max(0, durationMs / 1_000),
  }));
}

function turnStateForTime(firstSlot: ParticipantSlot, turnDurationsMs: number[], seconds: number): TurnState {
  let elapsedBoundary = 0;
  for (let index = 0; index < turnDurationsMs.length; index += 1) {
    const segmentSeconds = turnDurationsMs[index] / 1_000;
    const nextBoundary = elapsedBoundary + segmentSeconds;
    if (seconds < nextBoundary || index === turnDurationsMs.length - 1) {
      const elapsedInSegment = Math.max(0, seconds - elapsedBoundary);
      return {
        slot: turnSlot(firstSlot, index),
        progress: Math.max(0, Math.min(1, elapsedInSegment / Math.max(1, segmentSeconds))),
        seconds: Math.max(0, nextBoundary - seconds),
      };
    }
    elapsedBoundary = nextBoundary;
  }
  return null;
}

function turnSlot(firstSlot: ParticipantSlot, index: number): ParticipantSlot {
  return index % 2 === 0 ? firstSlot : firstSlot === 1 ? 2 : 1;
}

function clampSeconds(value: number, duration: number) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, safeDuration));
}

function formatSeconds(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function labelForSlot(debate: Debate, slot: ParticipantSlot) {
  return debate.participants.find(participant => participant.participant_slot === slot)?.answer.label ?? 'Answer';
}

function orderedParticipants(debate: Debate) {
  return [...debate.participants].sort((a, b) => a.participant_slot - b.participant_slot);
}

function speakerLabel(participant: { display_name: string | null; profile_space_id: string }) {
  return participant.display_name || participant.profile_space_id;
}

function statusLabel(status: Debate['status']) {
  return status.replace('_', ' ');
}

function formatDate(value: string | null) {
  if (!value) return 'Not started';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
