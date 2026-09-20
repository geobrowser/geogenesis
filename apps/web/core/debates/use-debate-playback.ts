'use client';

import * as React from 'react';

import { atom, useAtom } from 'jotai';

import type { Debate } from './api';
import { useDebateMedia, useDebateTranscript, useRecordingUrl } from './hooks';
import {
  type PlayBothOutcome,
  type TurnState,
  clampSeconds,
  normalizeTurnDurationsMs,
  pairPlayhead,
  participantForSlot,
  playBothWithMutedFallback,
  recordingWindowOffsetsSeconds,
  sortTurnSegments,
  timelineSecondsFor,
  timelineSecondsForSegments,
  turnStateForTime,
  turnStateFromSegments,
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
 * Drift thresholds for keeping the two recordings in step (GEO-2828).
 *
 * The old code had one threshold — 0.18s — and one response, a hard seek. On MediaRecorder WebM
 * with no Cues a seek is a parse walk, so correcting ordinary drift that way cost more than the
 * drift did and provoked the next correction: 105 seeks in a single 210s playback.
 */
/** Below this, the pair is in step and the rate is left alone. */
const SYNC_NUDGE_DRIFT_SECONDS = 0.18;
/** Above this the gap is too wide to close by rate alone, so it is worth one seek. */
const SYNC_SEEK_DRIFT_SECONDS = 0.75;
/** How far off 1 the nudge goes. 3% converges 0.18s inside ~6s and is inaudible. */
const SYNC_NUDGE_RATE = 0.03;
/** Floor between hard seeks, so a seek that itself causes drift cannot start a storm. */
const MIN_SYNC_SEEK_INTERVAL_MS = 2_000;
/**
 * Floor between attempts to restart an element the browser stopped while the tab is off screen.
 * Same reasoning as the seek floor: a browser that re-stops it must not cost a seek per tick.
 */
const MIN_BACKGROUND_RESTART_INTERVAL_MS = 2_000;
/**
 * How many consecutive refusals before the off-screen restart gives up.
 *
 * The floor above paces the attempts but does not end them, and the ticks that drive them do not
 * stop coming: the element still running emits `timeupdate` for as long as it plays. On a browser
 * that simply declines to start a <video> off screen, that is an attempt every two seconds for as
 * long as the viewer leaves the tab — twenty minutes of it is about six hundred `currentTime`
 * writes, each a demuxer parse walk on these cue-less files (GEO-2828), on an element that is
 * never going to start. Five refusals is enough to tell a slow start from a policy, and the return
 * path resumes the pair anyway.
 */
const MAX_BACKGROUND_RESTART_ATTEMPTS = 5;
/** No forward progress for this long, while unpaused, counts as stalled rather than slow. */
const STALL_AFTER_MS = 500;
/** Progress smaller than this is float noise on `currentTime`, not playback. */
const STALL_EPSILON_SECONDS = 0.001;
/**
 * How close to the timeline's end counts as the end. Shared by `playbackEnded` and the
 * background recovery, so the two cannot disagree about whether a debate has finished.
 */
const PLAYBACK_END_EPSILON_SECONDS = 0.05;

/**
 * Is this tab off screen?
 *
 * Playback deliberately does *not* stop when the window loses focus or the tab is backgrounded
 * (GEO-2947) — a debate someone is listening to should keep running while they work in another
 * window, the way a background YouTube tab does. Scrolling the card out of the viewport is a
 * separate condition and still pauses; that lives in `suspend`.
 *
 * What this gate is for is the browser pausing us. A backgrounded tab is where the two elements
 * can end up in different play states through nobody's decision, and the corrections below —
 * written for a foreground pair that has drifted — do the wrong thing there. So they stand down
 * while hidden, and the pair is reconciled on the way back instead.
 *
 * Visibility, not focus: `document.hasFocus()` is false for every window but the frontmost one,
 * including a tab sitting fully on screen beside the one being typed in.
 *
 * Read straight off the document rather than through `useDebateVisibility`, whose answer is
 * deliberately graced by a minute (GEO-2836) because it gates polling cadence. A grace is exactly
 * wrong here — playback needs the instant a tab goes off screen, not "recently on screen".
 */
const documentIsHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

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
  /**
   * The browser refused to start this pair, so the viewer has to.
   *
   * Distinct from `userPaused`, which is a decision somebody made. This is a
   * decision made *for* them — and measured on a phone rather than guessed at
   * (GEO-2978): `play()` comes back `NotAllowedError` with the elements muted,
   * inline and fully buffered, which is iOS in Low Power Mode, or with
   * auto-play turned off for the site. Both are ordinary states a reader can be
   * in, not faults.
   *
   * It drives the same two things `userPaused` does — show the play control,
   * and stop the autoplay effect trying again — because a refusal that keeps
   * being retried is a refusal every time, and the viewer's tap is the one
   * thing that will be allowed.
   */
  const [autoplayBlocked, setAutoplayBlocked] = React.useState(false);
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
  /** Slot 1's last forward progress, for telling "stalled" apart from "merely not paused". */
  const primaryProgressRef = React.useRef<{ seconds: number; at: number } | null>(null);
  const lastSyncSeekAtRef = React.useRef(0);
  /** See MIN_BACKGROUND_RESTART_INTERVAL_MS. */
  const lastBackgroundRestartAtRef = React.useRef(0);
  /** Consecutive refusals of the off-screen restart. See MAX_BACKGROUND_RESTART_ATTEMPTS. */
  const backgroundRestartAttemptsRef = React.useRef(0);
  /**
   * Debate-time of the last tick where an element was actually running.
   *
   * The pair's position is normally readable straight off the elements, but not once a hidden
   * tab has stopped both of them at different moments: slot 1 stops, slot 2 plays on, slot 2
   * stops too, and now every clock on the page is behind where the debate actually got to. This
   * is the only record of it. Reset on a deliberate seek and when the recordings change, so it
   * can never drag a scrub — or a different debate — forward. See `pairPlayhead`.
   */
  const lastRunningPlayheadRef = React.useRef<number | null>(null);
  /**
   * Which resume attempt is current.
   *
   * `resumeBoth` awaits up to ~600ms confirming both elements really started (playback-utils
   * polls 4x75ms, and twice if it has to retry muted). A feed card can cross its activation
   * threshold more than once inside that window. The hysteresis added to the explore card
   * alongside this makes that rarer, but it cannot make it impossible — any scroll, tap or
   * scrub landing mid-confirm produces the same overlap, so correctness belongs here.
   *
   * Without this guard an interrupted attempt still ran its post-await writes:
   *   - `suspend()` pauses the elements, so the confirm poll sees `paused` and reports
   *     'blocked'. The card then shows "Could not play both videos" for a failure that never
   *     happened and stays frozen until the viewer taps it — GEO-2895's "videos will look
   *     frozen / stop auto playing ... was able to get it to play after clicking".
   *   - an attempt that resolved after a suspend set `playing` back to true while the
   *     elements were paused, and the autoplay effect's `!playing` guard then refused to
   *     retry, so the card stayed stuck.
   *   - `setUserPaused(false)` could erase a pause the viewer made during the await.
   */
  const resumeGenerationRef = React.useRef(0);
  /**
   * The newest attempt that confirmed playback, so an older one cannot contradict it.
   *
   * `resumeGenerationRef` alone cannot settle this. It says which attempt *owns* the elements now,
   * and the refusal above it is recorded precisely because that ownership has usually moved on by
   * the time an attempt reports. This says which attempt last won, which is the only thing that
   * makes a stale refusal safe to drop.
   */
  const playingGenerationRef = React.useRef(0);
  /**
   * Which debate the card is showing, so an attempt cannot answer for a different one.
   *
   * `resumeGenerationRef` scopes an attempt to the *card*, which was enough while a card meant one
   * debate. It does not: the feed keys its cards by claim, so a re-rank hands a new debate to this
   * same hook, and an attempt already in flight goes on to report about a debate nobody is looking
   * at any more. The refusal write is the case that needed a second counter, because it sits above
   * the ownership check on purpose — a refusal has to outlive supersession within a debate, and
   * must not outlive the debate itself.
   */
  const debateGenerationRef = React.useRef(0);
  /**
   * How many resumes are still confirming.
   *
   * `resumeGenerationRef` above answers "is this attempt still the current one"; this answers
   * "is an attempt in progress at all", which the corrections in `updateTurnState` need and
   * cannot get from a generation number.
   *
   * A resume is a split pair by construction: `playBothWithMutedFallback` starts both elements
   * and then spends up to ~300ms confirming, and slot 2 — a cue-less MediaRecorder WebM — is
   * routinely the later of the two. Slot 1 emits `timeupdate` about four times a second the
   * whole time, so a tick lands inside that window as a matter of course. Reading it as "the
   * browser stopped playback on us" pauses the element that had just started and records a user
   * pause, which is the very failure this file keeps having to fix (GEO-2783, GEO-2895).
   */
  const resumesInFlightRef = React.useRef(0);
  /**
   * The same fact as `resumesInFlightRef`, rendered.
   *
   * `playBothWithMutedFallback` mutes both elements to retry a blocked play and leaves them that
   * way; it cannot put them back, because it does not know what the caller renders `muted` from
   * and anything it captured is a whole confirm window (~300ms an attempt) out of date by then. So the component that renders `muted`
   * repairs it instead, and this is how it knows the attempt is over — and, while it is not,
   * that it must not write `muted` from underneath a retry that depends on it.
   */
  const [isResuming, setIsResuming] = React.useState(false);
  const getRecordingPlaybackUrlRef = React.useRef(recordingUrlMutation.mutateAsync);

  const turnDurations = React.useMemo(
    () => normalizeTurnDurationsMs(debate.turn_durations_ms),
    [debate.turn_durations_ms]
  );

  // GEO-2949. `turn_durations_ms` is the format's allowance, not what the render cut. Debaters
  // end turns early, so switching the audible panel on the allowance runs late on every turn.
  // The media query is the same one the feed card already issues, so this is a cache read rather
  // than a second request; `turn_segments` is absent on older API replicas and on a debate whose
  // media job has not finished, and the allowance remains the fallback for both.
  const mediaQuery = useDebateMedia(debate.id, enabled);
  const turnSegments = React.useMemo(
    () => sortTurnSegments(mediaQuery.data?.turn_segments ?? []),
    [mediaQuery.data?.turn_segments]
  );
  const turnStateAt = React.useCallback(
    (seconds: number): TurnState =>
      turnSegments.length > 0
        ? turnStateFromSegments(turnSegments, seconds)
        : turnStateForTime(debate.first_participant_slot, turnDurations, seconds),
    [debate.first_participant_slot, turnDurations, turnSegments]
  );

  // The rendered video is shorter than the allowance by every early yield — 5.59s on the debate
  // this was measured against — so taking the total from the allowance leaves the scrubber
  // running past the end of both recordings.
  const timelineSeconds = React.useMemo(
    () => (turnSegments.length > 0 ? timelineSecondsForSegments(turnSegments) : timelineSecondsFor(turnDurations)),
    [turnDurations, turnSegments]
  );
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

  // Callers depend on `turnStateAt` itself, never on the metadata behind it. Listing its internals
  // instead would happen to work — it changes identity exactly when they do — but only by
  // coincidence, and GEO-2949 has just made it one dependency deeper. Worth stating because
  // nothing checks it: this project's eslint config pulls `eslint-config-next/typescript` only, so
  // `react-hooks/exhaustive-deps` is not enabled and a stale dependency list lints clean.

  // The slot whose turn it is at the current playhead — stable across pause, so
  // the speaker stays in colour (and keeps subtitles) when the viewer pauses.
  const activeSlot = React.useMemo(() => turnStateAt(playheadSeconds)?.slot ?? null, [playheadSeconds, turnStateAt]);

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

  // Which recordings `urls` currently holds signed URLs for, so re-entering a card does
  // not re-request them (GEO-2895).
  //
  // `enabled` is the card's activation state, and it flips every time the card crosses the
  // viewport threshold while scrolling — in the explore feed that is a single
  // `intersectionRatio >= 0.6` with no hysteresis, so it can flip several times on one
  // drag. This effect depends on `enabled` and used to open with
  // `setUrls({slot1: null, slot2: null})`, so each flip discarded URLs that were still
  // good and issued two fresh requests. `src` going null renders the "Loading…"
  // placeholder, which is the flicker: a card the viewer had already watched blanking and
  // reloading as they scrolled past it.
  //
  // `useRecordingUrl` is a mutation rather than a query, so nothing upstream caches this —
  // every discarded URL is a real round trip.
  const fetchedForRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    if (!slot1RecordingFilename || !slot2RecordingFilename) {
      setError('This debate needs both recordings before it can be watched.');
      return;
    }

    const recordingsKey = `${debate.id}|${slot1RecordingFilename}|${slot2RecordingFilename}`;
    // Already holding URLs for exactly these recordings — a re-activation, not a new debate.
    if (fetchedForRef.current === recordingsKey) return;

    let cancelled = false;
    fetchedForRef.current = recordingsKey;
    const releaseKey = () => {
      if (fetchedForRef.current === recordingsKey) fetchedForRef.current = null;
    };
    setUrls({ slot1: null, slot2: null });
    // A different debate's clocks start over; carrying this across would strand the new one
    // at the old one's position.
    lastRunningPlayheadRef.current = null;
    setError(null);
    /*
     * And so does everything the viewer's last debate concluded about itself.
     *
     * The feed keys its cards by claim rather than by debate id, so a re-rank that changes which
     * debate represents a claim hands a new one to the same hook. A refusal describes the device
     * and would be true again, but nothing here has asked yet — leaving it set puts the tap
     * control on a card that was never refused and stops the autoplay this debate is owed. A
     * pause is worse: it belongs to a debate the viewer is no longer looking at.
     */
    setAutoplayBlocked(false);
    setUserPaused(false);
    /*
     * And nothing still in flight may write either of them back.
     *
     * Clearing the state is only half of it: `resumeBoth` awaits up to ~600ms, so an attempt
     * belonging to the debate being replaced can still be inside that window. Bumping both
     * counters retires it — `resumeGenerationRef` for everything under the ownership check, which
     * would otherwise set `playing` and a turn for the wrong debate on elements now holding a
     * different `src`, and `debateGenerationRef` for the refusal write, which deliberately runs
     * above that check and would re-latch the tap control on a debate nothing has asked about yet.
     */
    resumeGenerationRef.current++;
    debateGenerationRef.current++;

    Promise.all([
      getRecordingPlaybackUrlRef.current({ debateId: debate.id, filename: slot1RecordingFilename }),
      getRecordingPlaybackUrlRef.current({ debateId: debate.id, filename: slot2RecordingFilename }),
    ])
      .then(([slot1Result, slot2Result]) => {
        // Scrolled away mid-flight: nothing is committed, so release the key or the card
        // would hold a claim on URLs it never received and never fetch again.
        if (cancelled) {
          releaseKey();
          return;
        }
        setUrls({ slot1: slot1Result.url, slot2: slot2Result.url });
      })
      .catch(caught => {
        // Same on failure, otherwise one error leaves the card permanently on "Loading…".
        releaseKey();
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
      // A deliberate seek resets both the nudge and the stall watch: the pair is aligned by
      // construction here, and slot 1's `currentTime` has just jumped, which is not progress.
      secondaryVideo.playbackRate = 1;
      primaryProgressRef.current = null;
      // This *is* the debate's position now — a scrub backwards must not be dragged forward by
      // where playback had previously got to.
      lastRunningPlayheadRef.current = playhead;
      lastSyncSeekAtRef.current = Date.now();
      return true;
    },
    [offsets]
  );

  const updateTurnState = React.useCallback(() => {
    const primaryVideo = slot1VideoRef.current;
    const secondaryVideo = slot2VideoRef.current;
    const pendingSeekSeconds = pendingSeekSecondsRef.current;
    if (pendingSeekSeconds !== null && seekVideosTo(pendingSeekSeconds)) {
      pendingSeekSecondsRef.current = null;
    }

    // Hoisted above the playhead read, which depends on it: off screen, which element's clock
    // counts as the debate's is a different question than it is in the foreground.
    const hidden = documentIsHidden();

    // Slot 1 is the clock. Off screen it may not be — the browser stops whichever element it
    // considers silent, freezing that clock while the other carries on — so there, and only
    // there, slot 2 and the remembered position are evidence too. In the foreground slot 2 is
    // deliberately allowed to run ahead (the drift nudge, and further still while slot 1 stalls),
    // so trusting it would resume past audio the viewer never heard. See `pairPlayhead`.
    const position = pairPlayhead(primaryVideo, secondaryVideo, offsets, lastRunningPlayheadRef.current, hidden);
    const playhead = clampSeconds(position.seconds, timelineSeconds);
    // Off screen, record it whether or not it came off a running element: this tick may be the
    // `pause` event of the last element still going, and its final position is not observable
    // anywhere else. Clamped rather than assigned, because the invariant this used to assert —
    // that `playhead` already folds the previous record in — is the helper's to keep, not this
    // line's to assume. It is kept under `trustSecondary`; the clamp makes it local and cheap.
    if (hidden) lastRunningPlayheadRef.current = Math.max(lastRunningPlayheadRef.current ?? 0, playhead);
    else if (position.live) lastRunningPlayheadRef.current = playhead;
    setPlayheadSeconds(playhead);

    // Lock slot 2 to slot 1, offset by the gap between when the two recordings started, so
    // neither debater's audio drifts ahead of the other.
    //
    // Two things make this harder than it looks, and getting either wrong is visible as a
    // glitching video (GEO-2828).
    //
    // **A stalled slot 1 must not be a seek target.** `paused` stays false while a video
    // starves for data, so "not paused" does not mean "advancing". When slot 1 stalled — it is
    // the larger file, so it starves first — its `currentTime` froze, drift crossed the
    // threshold, and slot 2 was dragged *back* to the frozen position, played forward a second,
    // and was dragged back again. That is the reported "same 1 second over and over", and it
    // sustains itself for as long as slot 1 is starved.
    //
    // **Small drift must not be corrected by seeking.** These are MediaRecorder WebM files with
    // one cluster of unknown size and no Cues, so every seek is a parse walk rather than an
    // index lookup — expensive enough to cause the drift that triggers the next one. Measured
    // on a 210s debate before this change: 105 programmatic seeks, 103 of them on slot 2. Drift
    // reaches the old 0.18s threshold in about two seconds of playback, so it could never
    // settle. Nudging the rate absorbs ordinary drift without touching the demuxer; a seek is
    // kept for a gap too large to close that way.
    const syncDelta = offsets.slot2 - offsets.slot1;
    const now = Date.now();
    // Every correction below assumes the pair's play/pause states are the settled result of a
    // decision — ours or the viewer's. Two situations break that assumption, and in both the
    // right move is to leave the elements alone rather than to "fix" them: a hidden tab, where
    // the browser stops elements of its own accord, and a resume that has not finished starting
    // them yet. A resume is a split pair by construction, and slot 2 — the cue-less WebM — is
    // routinely the later of the two to start, so a tick landing there sees a gap that is not
    // drift and answers it by nudging or hard-seeking the element that is still trying to begin.
    // On these files a seek is a parse walk (GEO-2828), so that makes the start it is competing
    // with slower still.
    const pairIsSettled = !hidden && resumesInFlightRef.current === 0;

    if (primaryVideo) {
      const progress = primaryProgressRef.current;
      if (!progress || primaryVideo.currentTime > progress.seconds + STALL_EPSILON_SECONDS) {
        primaryProgressRef.current = { seconds: primaryVideo.currentTime, at: now };
      }
    } else {
      primaryProgressRef.current = null;
    }

    // `readyState` is the direct signal and the clock is the corroborating one: a video can sit
    // at HAVE_ENOUGH_DATA and still not advance if the decoder is wedged.
    const primaryStalled =
      !primaryVideo ||
      primaryVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
      (primaryProgressRef.current !== null && now - primaryProgressRef.current.at > STALL_AFTER_MS);

    if (
      primaryVideo &&
      secondaryVideo &&
      pairIsSettled &&
      !primaryVideo.paused &&
      !secondaryVideo.seeking &&
      !primaryStalled
    ) {
      const drift = secondaryVideo.currentTime - (primaryVideo.currentTime - syncDelta);
      const absDrift = Math.abs(drift);

      if (absDrift > SYNC_SEEK_DRIFT_SECONDS && now - lastSyncSeekAtRef.current > MIN_SYNC_SEEK_INTERVAL_MS) {
        secondaryVideo.currentTime = Math.max(0, primaryVideo.currentTime - syncDelta);
        secondaryVideo.playbackRate = 1;
        lastSyncSeekAtRef.current = now;
      } else if (absDrift > SYNC_NUDGE_DRIFT_SECONDS) {
        // Small enough that a rate change closes it within a few seconds, and far enough from 1
        // to actually converge. Pitch shift at 3% is not audible.
        secondaryVideo.playbackRate = drift > 0 ? 1 - SYNC_NUDGE_RATE : 1 + SYNC_NUDGE_RATE;
      } else if (secondaryVideo.playbackRate !== 1) {
        secondaryVideo.playbackRate = 1;
      }
    } else if (secondaryVideo && secondaryVideo.playbackRate !== 1) {
      // Never leave a nudge running once the pair is no longer being kept in step.
      secondaryVideo.playbackRate = 1;
    }

    // Keep both videos in the same play/pause state. If the browser pauses one
    // on its own (e.g. it blocks the unmuted speaker under autoplay policy),
    // pause the other too so audio and video can never drift apart.
    //
    // Not while the tab is hidden, though (GEO-2947). Backgrounding splits the pair without
    // anyone deciding to: a browser that stops a silent <video> off screen stops the listening
    // debater's element and leaves the speaking one running. Reading that as "the browser
    // stopped playback on us" pauses the half that was still playing — the audio the viewer was
    // listening to — and records it as a *user* pause, which auto-resume then refuses to undo.
    // That is the reported bug: switch windows and the debate goes silent until you click it.
    // A hidden tab is reconciled on return instead; see the visibilitychange effect below.
    if (
      primaryVideo &&
      secondaryVideo &&
      pairIsSettled &&
      primaryVideo.paused !== secondaryVideo.paused &&
      playhead < timelineSeconds
    ) {
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

    if (playhead >= timelineSeconds) {
      setPlaying(false);
      setTurnState(null);
      return;
    }

    // Whose turn it is comes off the playhead. Slot 1 being stopped normally means playback is
    // not running, so there is no turn to show — but off screen it usually means the browser
    // stopped slot 1, which is the *muted* element for the whole of slot 2's turn. Nulling the
    // turn there drops `audible`, and `audible` is what un-mutes the speaking video, so slot 2
    // would go silent while it was still perfectly happily playing. Same silence as before,
    // arriving through the back door.
    if (pairIsSettled && (!primaryVideo || primaryVideo.paused || primaryVideo.ended)) {
      setTurnState(null);
      return;
    }

    const turn = turnStateAt(playhead);
    setTurnState(turn);

    // The turn moving to an element the browser stopped off screen is the one case where a
    // hidden tab needs us to act rather than stand down.
    //
    // Standing down keeps the *current* speaker running, which is all the viewer can hear right
    // now — but only until the turn changes. At the boundary `audible` moves to the other
    // recording, and if that is the one the browser stopped, the debate goes silent for the rest
    // of it. So bring it back: align it to where the running element has got to, and start it.
    //
    // Deliberately narrow. It needs a pair that is genuinely split — one element still running —
    // so a tab where the browser stopped *both* (the feed's muted default, which nobody is
    // listening to) is left alone rather than being restarted off screen for no one. A floor
    // between attempts keeps a browser that simply re-stops it from turning this into a seek
    // storm; seeks on these cue-less WebM files are expensive (GEO-2828). And it never records a
    // pause or an error on failure: refusing to start a video in a background tab is the
    // browser's prerogative, not something the viewer needs to be told about.
    if (hidden && turn) {
      const speaking = turn.slot === 1 ? primaryVideo : secondaryVideo;
      const listening = turn.slot === 1 ? secondaryVideo : primaryVideo;
      const speakingOffset = turn.slot === 1 ? offsets.slot1 : offsets.slot2;
      // Running, so the last attempt took (or it was never stopped): the budget is for a run of
      // refusals, not a lifetime total, and a turn that hands over to a healthy element resets it.
      if (speaking && !speaking.paused) backgroundRestartAttemptsRef.current = 0;

      if (
        speaking?.paused &&
        listening &&
        !listening.paused &&
        backgroundRestartAttemptsRef.current < MAX_BACKGROUND_RESTART_ATTEMPTS &&
        now - lastBackgroundRestartAtRef.current > MIN_BACKGROUND_RESTART_INTERVAL_MS
      ) {
        lastBackgroundRestartAtRef.current = now;
        backgroundRestartAttemptsRef.current += 1;
        speaking.currentTime = Math.max(0, playhead - speakingOffset);
        void speaking.play().catch(() => {
          /* The browser is entitled to refuse an off-screen start; the return path retries. */
        });
      }
    }
  }, [offsets, seekVideosTo, timelineSeconds, turnStateAt]);

  const pauseBoth = React.useCallback(() => {
    // Supersede any resume still confirming, so it cannot un-pause the viewer.
    resumeGenerationRef.current++;
    for (const video of videos()) video.pause();
    setPlaying(false);
    setUserPaused(true);
    setTurnState(null);
  }, [videos]);

  const resumeBoth = React.useCallback(
    async (fromSeconds?: number) => {
      const primaryVideo = slot1VideoRef.current;
      const secondaryVideo = slot2VideoRef.current;
      if (!primaryVideo || !secondaryVideo) return;
      // Claim this attempt. Bumping on entry also supersedes an earlier resume that is still
      // awaiting, so two overlapping activations cannot both write state.
      const generation = ++resumeGenerationRef.current;
      const debateGeneration = debateGenerationRef.current;
      setError(null);
      // Realign the pair so a resume can't leave the recordings drifting. Off the *running*
      // element's clock, not slot 1's unconditionally: a resume on return from a backgrounded tab
      // is exactly the case where slot 1 may be the one the browser stopped, and seeking to its
      // frozen position would rewind the debate over everything just heard (GEO-2947).
      // Where to resume from. Normally the pair's own position, read the foreground way: slot 1 is
      // canonical, and a running slot 1 is the whole answer.
      //
      // `fromSeconds` is for the one caller that knows better — the reconcile on the way back from a
      // hidden tab, where slot 1 can be running at the instant the browser stopped it rather than at
      // where the debate got to. It has already worked that out; re-deriving it here would read the
      // stale clock and rewind the pair over audio the viewer heard while away.
      const resumeFrom =
        fromSeconds ?? pairPlayhead(primaryVideo, secondaryVideo, offsets, lastRunningPlayheadRef.current).seconds;
      seekVideosTo(clampSeconds(resumeFrom, timelineSeconds));
      // allSettled never rejects, so a failed play() (e.g. blocked by autoplay
      // policy) leaves the video paused rather than throwing — check both the
      // settled results and the paused state, and surface the error inline.
      //
      // Counted across the await, not just marked: overlapping attempts are normal here (see
      // `resumeGenerationRef`), and a flag would be cleared by the first to finish while the
      // other was still starting its elements.
      resumesInFlightRef.current++;
      setIsResuming(true);
      let outcome: PlayBothOutcome;
      try {
        outcome = await playBothWithMutedFallback(primaryVideo, secondaryVideo, {
          // The helper spends most of its runtime asleep confirming, and a pause, a scrub or a
          // scroll-away lands in that window routinely. Bumping the generation is how all of those
          // say "these elements are mine now", so it is the cancellation signal — checked inside,
          // before the muted retry, because by the time this returns the retry's `play()` has
          // already happened and no state check here can take it back.
          isCancelled: () => resumeGenerationRef.current !== generation,
        });
      } finally {
        resumesInFlightRef.current--;
        // Only the last one out: overlapping attempts are normal here, and the renderer must not
        // repair `muted` while another retry is still relying on it.
        if (resumesInFlightRef.current === 0) setIsResuming(false);
      }
      // Superseded while we waited — something else owns these elements now. Every write below
      // would describe a playback attempt that no longer exists, including the 'blocked' error,
      // which at this point only means "someone paused us mid-confirm". 'cancelled' is the same
      // thing noticed from inside, and is spelled out rather than left to the generation check so
      // that a future caller cannot accidentally read it as a successful start.
      if (outcome === 'cancelled') return;

      /*
       * A refusal outlives the attempt that discovered it.
       *
       * It describes the device — this browser will not autoplay right now — so
       * it is recorded above the ownership check, which exists to stop a
       * superseded attempt writing *playback* state. And superseded is the norm
       * rather than the exception: `resumeBoth` bumps the generation on entry
       * and the autoplay effect re-enters while `playing` is false, so an
       * attempt is routinely overtaken before it reports. Recorded below the
       * check, the refusal was discarded every time and the card never learned
       * of it.
       *
       * It also ends that loop, because the effect reads the flag.
       *
       * The one thing that does overrule it is a later attempt that actually
       * started. A refusal reported after that attempt won would put the tap
       * control over a running video, and the tap would stop it — the two-tap
       * symptom this was written to remove.
       */
      if (
        outcome === 'refused' &&
        debateGenerationRef.current === debateGeneration &&
        playingGenerationRef.current < generation
      ) {
        setAutoplayBlocked(true);
      }

      if (resumeGenerationRef.current !== generation) return;

      if (outcome === 'refused' || outcome === 'blocked') {
        // The elements and the playback state belong to *this* attempt, so they stay under the
        // ownership check — pausing elements a newer resume has started would undo it.
        primaryVideo.pause();
        secondaryVideo.pause();
        setPlaying(false);
        setTurnState(null);
        /*
         * Only the unexplained failure says so out loud.
         *
         * 'blocked' is a stall, a missing recording, a decode failure — the viewer is owed both a
         * reason and a retry, and the autoplay effect keeps retrying because nothing latched.
         * 'refused' is the browser declining, where this copy was actively wrong: it named a
         * control that was not on screen and a failure that had not happened. The videos are fine;
         * the device simply wants to be asked by a person, and `autoplayBlocked` puts that
         * question on the card as a control instead of a sentence.
         */
        if (outcome === 'blocked') {
          /*
           * A block releases the latch, and that omission is what this fixes.
           *
           * 'blocked' from an attempt we still own is positive evidence that the browser is no
           * longer refusing: it let `play()` through and the media did not confirm. Leaving
           * `autoplayBlocked` set from an earlier refusal left `awaitingTap` true, which is what
           * the feed's autoplay effect reads — so the retry this outcome exists to allow never
           * happened, and the card sat behind the manual control saying "Try Play again" about a
           * control that would not have helped. A latch is only as good as the conditions that
           * release it.
           */
          setAutoplayBlocked(false);
          setError('Could not play both videos. Try Play again.');
        }
        return;
      }
      // The browser only allowed it muted (GEO-2783) — record that so the unmute control is honest
      // and later autoplays stop being blocked the same way. The viewer's next tap is a gesture and
      // will be allowed.
      if (outcome === 'playing-muted') setMutedByUser(true);
      playingGenerationRef.current = generation;
      setPlaying(true);
      setUserPaused(false);
      // Whatever refused last time has stopped refusing.
      setAutoplayBlocked(false);
    },
    [offsets, seekVideosTo, setMutedByUser, timelineSeconds]
  );

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
    // No `muted` write here any more. It existed to repair the one case where the elements can be
    // muted behind React's back — a blocked autoplay fallback — and that repair belongs to
    // whoever renders `muted`, which is not this hook: the value available here (`mutedByUser`)
    // stops being the rendered one as soon as the per-turn gate falls back to muting on a
    // platform where `volume` is read-only. Writing it from here only moved the divergence
    // (GEO-2947). `DebateFeedPlayer` re-asserts it when `isResuming` falls.
    seekVideosTo(0);
    await resumeBoth();
  }, [resumeBoth, seekVideosTo]);

  const seekBoth = React.useCallback(
    (seconds: number) => {
      const nextTime = clampSeconds(seconds, timelineSeconds);
      pendingSeekSecondsRef.current = nextTime;
      if (seekVideosTo(nextTime)) pendingSeekSecondsRef.current = null;
      setPlayheadSeconds(nextTime);
      setTurnState(turnStateAt(nextTime));
      window.requestAnimationFrame(updateTurnState);
    },
    [seekVideosTo, timelineSeconds, turnStateAt, updateTurnState]
  );

  const ready = Boolean(urls.slot1 && urls.slot2);
  const playbackEnded =
    ready && timelineSeconds > 0 && playheadSeconds >= timelineSeconds - PLAYBACK_END_EPSILON_SECONDS;

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

  /**
   * Come back from a backgrounded tab in the state the viewer left (GEO-2947).
   *
   * Nothing here pauses on blur or on hide. But the browser can still pause an element while the
   * tab is off screen, and the sync step above stands down rather than reacting to it, so a tab
   * that has been away may come back with one or both videos paused while this hook still
   * believes playback is running. Reconcile that on the return instead of leaving the card frozen
   * with no controls showing — `playing` is true, so the feed's autoplay effect (`!playing`)
   * would never retry it.
   *
   * `resumeBoth` is the right instrument: it realigns both elements to `pairPlayhead` before
   * starting them, so the pair comes back in step at wherever the debate actually got to — which
   * off the back of a hidden tab is whichever element was still running, or the furthest position
   * seen if the browser stopped them both, and is emphatically not slot 1's frozen clock. Nothing
   * resets the playhead and nothing touches the mute preference.
   *
   * Only when the viewer had it playing: an explicit pause, a finished debate or a scrub in
   * progress all mean "leave it alone", which is what `backgroundIntentRef` carries.
   *
   * The one thing it cannot tell apart is a pause the viewer made from *outside* the page while
   * it was hidden — a media key, or an OS media control. That arrives as an element pausing on
   * its own, indistinguishable from the background pause this exists to undo, so it is resumed
   * too. Accepted deliberately: the ticket is about background listening, the feed autoplays
   * muted, and the alternative is to keep a debate stopped for the far commoner reason.
   */
  /**
   * Work out where the debate actually got to while the tab was away, and record it.
   *
   * Reads with `trustSecondary`, which nothing else in the foreground does. This is the one moment
   * where it is right: the pair has just come back from being stopped by the browser rather than
   * by us, so a frozen slot 1 is evidence of nothing but the instant it was stopped, and slot 2's
   * clock may be the only record of the last seconds played. An ordinary pause or scroll-away must
   * never reach this — there slot 2 is ahead on purpose and resuming from it would skip audio —
   * which is exactly why it lives here rather than inside `resumeBoth`.
   *
   * The ticks that ran while hidden will usually have recorded this already (a browser pausing an
   * element fires `pause`, and that is wired to `onPlaybackTick`). This does not depend on their
   * having done so.
   */
  const recoverBackgroundPlayhead = React.useCallback((): number | null => {
    const primaryVideo = slot1VideoRef.current;
    const secondaryVideo = slot2VideoRef.current;
    if (!primaryVideo || !secondaryVideo) return null;
    const position = pairPlayhead(primaryVideo, secondaryVideo, offsets, lastRunningPlayheadRef.current, true);
    const recovered = clampSeconds(position.seconds, timelineSeconds);
    lastRunningPlayheadRef.current = recovered;
    // Back on screen: whatever the browser refused off screen, it is not refusing now.
    backgroundRestartAttemptsRef.current = 0;

    // Publish it, not just remember it. `playheadSeconds` is React state that only ticks maintain,
    // and ticks are exactly what a background tab throttles — so on the way back it can be a
    // whole hidden period out of date, and everything read off it with it: the scrubber, the
    // active speaker, and `playbackEnded`.
    setPlayheadSeconds(recovered);

    // `timelineSeconds > 0` mirrors `playbackEnded` exactly — the point of sharing the epsilon was
    // that the two cannot disagree about whether a debate has finished, and a zero-length timeline
    // is the one input where they still could.
    if (timelineSeconds <= 0 || recovered < timelineSeconds - PLAYBACK_END_EPSILON_SECONDS) {
      // The turn moves with the playhead. It is separate state rather than derived, and it is
      // what `audible` reads — so a pair that kept playing across a turn boundary while hidden
      // would otherwise come back with the volume still on the debater who had stopped speaking,
      // until the next media tick happened to correct it.
      setTurnState(turnStateAt(recovered));
      return recovered;
    }

    // The debate finished while the tab was away. Resuming here would be wrong twice over: there
    // is nothing left to play, and `play()` on an element sitting at its end is defined to start
    // it again from the beginning — so the viewer would come back to the debate replaying itself,
    // or to a spurious "could not play" (GEO-2947). Land in the finished state instead, which is
    // the one the ticks would have reached had they been allowed to run.
    setPlaying(false);
    setTurnState(null);
    return null;
  }, [offsets, timelineSeconds, turnStateAt]);

  const backgroundIntentRef = React.useRef<{
    shouldBePlaying: boolean;
    resumeBoth: (fromSeconds?: number) => Promise<void>;
    /** @returns the position to resume from, or null when the debate finished while away. */
    recoverBackgroundPlayhead: () => number | null;
  }>({
    shouldBePlaying: false,
    resumeBoth,
    recoverBackgroundPlayhead,
  });
  React.useEffect(() => {
    backgroundIntentRef.current = {
      shouldBePlaying: playing && !userPaused && !isScrubbing && !playbackEnded,
      resumeBoth,
      recoverBackgroundPlayhead,
    };
  }, [isScrubbing, playbackEnded, playing, recoverBackgroundPlayhead, resumeBoth, userPaused]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const reconcile = () => {
      if (documentIsHidden()) return;
      const { shouldBePlaying, resumeBoth: resume, recoverBackgroundPlayhead: recover } = backgroundIntentRef.current;
      if (!shouldBePlaying) return;
      const primaryVideo = slot1VideoRef.current;
      const secondaryVideo = slot2VideoRef.current;
      if (!primaryVideo || !secondaryVideo) return;
      // Settle where the debate got to *first*, and unconditionally: the state this reads from
      // is maintained by ticks, and a throttled background tab is precisely where ticks did not
      // run. That includes the case the resume must not happen at all.
      const recovered = recover();
      if (recovered === null) return;
      // Both still running — the tab was backgrounded and the browser let it be. Nothing to do,
      // and calling resumeBoth here would seek a pair that is already in step.
      if (!primaryVideo.paused && !secondaryVideo.paused) return;
      // Hand the position over rather than letting the resume re-derive it: slot 1 may be running
      // again at the instant the browser stopped it, and that is not where the debate got to.
      void resume(recovered);
    };
    document.addEventListener('visibilitychange', reconcile);
    return () => document.removeEventListener('visibilitychange', reconcile);
  }, []);

  // Autoplay control for the feed: when a debate scrolls out of view we pause it
  // silently (without flipping userPaused, so it can auto-resume when back in view).
  const suspend = React.useCallback(() => {
    // The card left the viewport; a resume still confirming is stale by definition.
    resumeGenerationRef.current++;
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
    // The drag owns the playhead now; don't let a pending resume fight it.
    resumeGenerationRef.current++;
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
    autoplayBlocked,
    isScrubbing,
    isResuming,
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
