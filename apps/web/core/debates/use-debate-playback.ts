'use client';

import * as React from 'react';

import type { Debate } from './api';
import { useDebateTranscript, useRecordingUrl } from './hooks';
import {
  type TurnState,
  clampSeconds,
  normalizeTurnDurationsMs,
  participantForSlot,
  timelineSecondsFor,
  turnStateForTime,
} from './playback-utils';

type PlaybackUrls = {
  slot1: string | null;
  slot2: string | null;
};

/**
 * Drives the two synchronized debater recordings for a single debate: loads the
 * per-slot playback URLs, keeps the videos in lockstep, tracks the active turn
 * (for the countdown + subtitles), and exposes play/pause/seek/replay controls.
 * Shared by the browse feed; the videos themselves are rendered by the caller.
 */
export function useDebatePlayback(debate: Debate, enabled: boolean) {
  const recordingUrlMutation = useRecordingUrl();
  const [urls, setUrls] = React.useState<PlaybackUrls>({ slot1: null, slot2: null });
  const [error, setError] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  // Feed debates autoplay muted (TikTok-style): the browser blocks unmuted
  // autoplay without a user gesture, so unmuting the active speaker mid-autoplay
  // would pause and desync that video. Start muted; the viewer unmutes on tap.
  const [mutedByUser, setMutedByUser] = React.useState(true);
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
  const slot1Participant = participantForSlot(debate, 1);
  const slot2Participant = participantForSlot(debate, 2);
  const slot1RecordingFilename =
    debate.recordings.find(recording => recording.participant_slot === 1)?.filename ?? null;
  const slot2RecordingFilename =
    debate.recordings.find(recording => recording.participant_slot === 2)?.filename ?? null;

  // The slot whose turn it is at the current playhead — stable across pause, so
  // the speaker stays in colour (and keeps subtitles) when the viewer pauses.
  const activeSlot = React.useMemo(
    () => turnStateForTime(debate.first_participant_slot, turnDurations, playheadSeconds)?.slot ?? null,
    [debate.first_participant_slot, playheadSeconds, turnDurations]
  );

  const transcriptQuery = useDebateTranscript(debate.id, 'json', enabled);
  const transcriptSegments = transcriptQuery.data?.segments ?? [];
  const subtitle = React.useMemo(() => {
    if (!activeSlot) return null;
    const playheadMs = playheadSeconds * 1_000;
    const active = transcriptSegments.find(
      segment =>
        segment.participant_slot === activeSlot && segment.start_ms <= playheadMs && segment.end_ms >= playheadMs
    );
    return active?.text?.trim() || null;
  }, [activeSlot, playheadSeconds, transcriptSegments]);

  React.useEffect(() => {
    getRecordingPlaybackUrlRef.current = recordingUrlMutation.mutateAsync;
  }, [recordingUrlMutation.mutateAsync]);

  React.useEffect(() => {
    if (!enabled) return;
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
  }, [debate.id, enabled, slot1RecordingFilename, slot2RecordingFilename]);

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

    // Keep both videos in the same play/pause state. If the browser pauses one
    // on its own (e.g. it blocks the unmuted speaker under autoplay policy),
    // pause the other too so audio and video can never drift apart.
    if (
      primaryVideo &&
      secondaryVideo &&
      primaryVideo.paused !== secondaryVideo.paused &&
      currentTime < timelineSeconds
    ) {
      const stillPlaying = primaryVideo.paused ? secondaryVideo : primaryVideo;
      stillPlaying.pause();
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
    // Snap both to the same position so they resume in lockstep.
    const target = Math.max(...activeVideos.map(video => (Number.isFinite(video.currentTime) ? video.currentTime : 0)));
    for (const video of activeVideos) video.currentTime = target;
    // allSettled never rejects, so a failed play() (e.g. blocked by autoplay
    // policy) leaves the video paused rather than throwing — check both the
    // settled results and the paused state, and surface the error inline.
    const results = await Promise.allSettled(activeVideos.map(video => video.play()));
    const ok = results.every(result => result.status === 'fulfilled') && activeVideos.every(video => !video.paused);
    if (ok) {
      setPlaying(true);
      setUserPaused(false);
    } else {
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

  const togglePlayback = React.useCallback(() => {
    if (playing) {
      pauseBoth();
      return;
    }
    if (playbackEnded) {
      void playFromStart();
      return;
    }
    void resumeBoth();
  }, [pauseBoth, playFromStart, playbackEnded, playing, resumeBoth]);

  // Autoplay control for the feed: when a debate scrolls out of view we pause it
  // silently (without flipping userPaused, so it can auto-resume when back in view).
  const suspend = React.useCallback(() => {
    for (const video of videos()) video.pause();
    setPlaying(false);
    setTurnState(null);
  }, [videos]);

  return {
    slot1VideoRef,
    slot2VideoRef,
    slot1Participant,
    slot2Participant,
    urls,
    ready,
    error,
    playing,
    userPaused,
    playbackEnded,
    mutedByUser,
    setMutedByUser,
    playheadSeconds,
    timelineSeconds,
    turnState,
    activeSlot,
    subtitle,
    onPlaybackTick: updateTurnState,
    togglePlayback,
    playFromStart,
    resumeBoth,
    suspend,
    seekBoth,
  };
}

export type DebatePlaybackController = ReturnType<typeof useDebatePlayback>;
