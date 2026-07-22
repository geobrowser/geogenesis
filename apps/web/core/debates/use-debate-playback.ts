'use client';

import * as React from 'react';

import { atom, useAtom } from 'jotai';

import type { Debate } from './api';
import { useDebateTranscript, useRecordingUrl } from './hooks';
import {
  type TurnState,
  clampSeconds,
  normalizeTurnDurationsMs,
  participantForSlot,
  recordingWindowOffsetsSeconds,
  timelineSecondsFor,
  turnStateForTime,
} from './playback-utils';

type PlaybackUrls = {
  slot1: string | null;
  slot2: string | null;
};

// The viewer's mute preference is shared across every feed player so unmuting one debate
// holds as they scroll to the next — otherwise each debate mounts its own muted-by-default
// state and they'd have to unmute every single video. Defaults to muted so the cold-start
// autoplay isn't blocked by the browser's autoplay policy.
const feedMutedAtom = atom(true);

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
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const isScrubbingRef = React.useRef(false);
  const wasPlayingBeforeScrubRef = React.useRef(false);
  // Feed debates autoplay muted (TikTok-style): the browser blocks unmuted
  // autoplay without a user gesture, so unmuting the active speaker mid-autoplay
  // would pause and desync that video. Start muted; the viewer unmutes on tap.
  const [mutedByUser, setMutedByUser] = useAtom(feedMutedAtom);
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
  const slot1Recording = debate.recordings.find(recording => recording.participant_slot === 1) ?? null;
  const slot2Recording = debate.recordings.find(recording => recording.participant_slot === 2) ?? null;
  const slot1RecordingFilename = slot1Recording?.filename ?? null;
  const slot2RecordingFilename = slot2Recording?.filename ?? null;

  // How far each recording's own timeline sits from the debate-timeline origin, so the two
  // videos can be kept in lockstep despite starting at different instants on different devices.
  const slot1StartedAtMs = slot1Recording?.started_at_ms ?? null;
  const slot2StartedAtMs = slot2Recording?.started_at_ms ?? null;
  const offsets = React.useMemo(
    () => recordingWindowOffsetsSeconds(debate.started_at, slot1StartedAtMs, slot2StartedAtMs),
    [debate.started_at, slot1StartedAtMs, slot2StartedAtMs]
  );

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

  // `playhead` is debate-timeline seconds (0 = debate start). Map it onto each recording's
  // own currentTime via that recording's start offset so the two videos stay aligned.
  // We deliberately don't gate on a finite `video.duration`: MediaRecorder WebM files ship
  // without a duration in their header, so `duration` reads back NaN/Infinity even though
  // the media is fully seekable — gating on it is what left the scrubber unable to seek.
  const seekVideosTo = React.useCallback(
    (playhead: number) => {
      const primaryVideo = slot1VideoRef.current;
      const secondaryVideo = slot2VideoRef.current;
      if (!primaryVideo || !secondaryVideo) return false;
      primaryVideo.currentTime = Math.max(0, playhead - offsets.slot1);
      secondaryVideo.currentTime = Math.max(0, playhead - offsets.slot2);
      return true;
    },
    [offsets.slot1, offsets.slot2]
  );

  const updateTurnState = React.useCallback(() => {
    const primaryVideo = slot1VideoRef.current;
    const secondaryVideo = slot2VideoRef.current;
    const pendingSeekSeconds = pendingSeekSecondsRef.current;
    if (pendingSeekSeconds !== null && seekVideosTo(pendingSeekSeconds)) {
      pendingSeekSecondsRef.current = null;
    }

    // slot 1 is the clock: the debate-timeline playhead is its position plus the offset
    // between when it started recording and when the debate window opened.
    const playhead = clampSeconds((primaryVideo?.currentTime ?? 0) + offsets.slot1, timelineSeconds);
    setPlayheadSeconds(playhead);

    // Lock slot 2 to slot 1, offset by the gap between when the two recordings started, so
    // neither debater's audio drifts ahead of the other.
    const syncDelta = offsets.slot2 - offsets.slot1;
    if (
      primaryVideo &&
      secondaryVideo &&
      !primaryVideo.paused &&
      !secondaryVideo.seeking &&
      Math.abs(secondaryVideo.currentTime - (primaryVideo.currentTime - syncDelta)) > 0.18
    ) {
      secondaryVideo.currentTime = Math.max(0, primaryVideo.currentTime - syncDelta);
    }

    // Keep both videos in the same play/pause state. If the browser pauses one
    // on its own (e.g. it blocks the unmuted speaker under autoplay policy),
    // pause the other too so audio and video can never drift apart.
    if (primaryVideo && secondaryVideo && primaryVideo.paused !== secondaryVideo.paused && playhead < timelineSeconds) {
      const stillPlaying = primaryVideo.paused ? secondaryVideo : primaryVideo;
      stillPlaying.pause();
      // The browser stopped playback on us — surface it as a paused state so the
      // controls reappear and auto-resume stands down (it would just get blocked
      // again), rather than leaving the UI believing playback is still running.
      setPlaying(false);
      setUserPaused(true);
      setTurnState(null);
      return;
    }

    if (!primaryVideo || primaryVideo.paused || primaryVideo.ended || playhead >= timelineSeconds) {
      if (playhead >= timelineSeconds) setPlaying(false);
      setTurnState(null);
      return;
    }

    setTurnState(turnStateForTime(debate.first_participant_slot, turnDurations, playhead));
  }, [debate.first_participant_slot, offsets.slot1, offsets.slot2, seekVideosTo, timelineSeconds, turnDurations]);

  const pauseBoth = React.useCallback(() => {
    for (const video of videos()) video.pause();
    setPlaying(false);
    setUserPaused(true);
    setTurnState(null);
  }, [videos]);

  const resumeBoth = React.useCallback(async () => {
    const primaryVideo = slot1VideoRef.current;
    const secondaryVideo = slot2VideoRef.current;
    if (!primaryVideo || !secondaryVideo) return;
    setError(null);
    // Realign slot 2 to slot 1's position so a resume can't leave the recordings drifting.
    seekVideosTo(clampSeconds(primaryVideo.currentTime + offsets.slot1, timelineSeconds));
    // allSettled never rejects, so a failed play() (e.g. blocked by autoplay
    // policy) leaves the video paused rather than throwing — check both the
    // settled results and the paused state, and surface the error inline.
    const results = await Promise.allSettled([primaryVideo.play(), secondaryVideo.play()]);
    const ok = results.every(result => result.status === 'fulfilled') && !primaryVideo.paused && !secondaryVideo.paused;
    if (ok) {
      setPlaying(true);
      setUserPaused(false);
    } else {
      primaryVideo.pause();
      secondaryVideo.pause();
      setPlaying(false);
      setTurnState(null);
      setError('Could not play both videos. Try Play again.');
    }
  }, [offsets.slot1, seekVideosTo, timelineSeconds]);

  const playFromStart = React.useCallback(async () => {
    const primaryVideo = slot1VideoRef.current;
    const secondaryVideo = slot2VideoRef.current;
    if (!primaryVideo || !secondaryVideo) return;
    setError(null);
    setUserPaused(false);
    setPlayheadSeconds(0);
    pendingSeekSecondsRef.current = null;
    primaryVideo.pause();
    secondaryVideo.pause();
    primaryVideo.muted = mutedByUser;
    secondaryVideo.muted = mutedByUser;
    seekVideosTo(0);
    await resumeBoth();
  }, [mutedByUser, resumeBoth, seekVideosTo]);

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

  // While the viewer drags the scrubber, pause the videos so the playback clock stops
  // advancing the playhead out from under the drag. We don't flip userPaused (so the
  // paused overlay doesn't flash); `isScrubbing` instead keeps the autoplay effect from
  // resuming mid-drag. Playback picks back up on release if it was running.
  const beginScrub = React.useCallback(() => {
    // Guard against re-entry (e.g. Arrow-key repeat on the range input): only the
    // first call captures whether playback was running, so a repeated call can't
    // overwrite it with the now-paused `playing` value.
    if (isScrubbingRef.current) return;
    isScrubbingRef.current = true;
    wasPlayingBeforeScrubRef.current = playing;
    setIsScrubbing(true);
    for (const video of videos()) video.pause();
    setPlaying(false);
  }, [playing, videos]);

  const endScrub = React.useCallback(() => {
    // Idempotent: pointerup and lostpointercapture can both fire, so only the
    // first release resumes playback.
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    setIsScrubbing(false);
    if (wasPlayingBeforeScrubRef.current && !playbackEnded) void resumeBoth();
  }, [playbackEnded, resumeBoth]);

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
    isScrubbing,
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
    beginScrub,
    endScrub,
  };
}

export type DebatePlaybackController = ReturnType<typeof useDebatePlayback>;
