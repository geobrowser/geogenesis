import * as React from 'react';

import type { DebateFeedPlayerHandle } from '../browse/debate-feed-player';
import { PLAYBACK_END_EPSILON_MS } from '../playback-utils';
import type { EditorClip } from './reel';

/** One stretch to play, on the recordings' clock, and the clip it belongs to. */
export type PlaySegment = { key: string; start_ms: number; end_ms: number };

/**
 * What a range is doing.
 *
 * `loading`: a jump to the next clip is held under the outgoing frames until both recordings can
 * play on. `stalled`: the player stopped and nothing here asked it to (the hold was dropped, the
 * browser refused, the media never started), so the range waits for Play (`retry`).
 */
export type PlayRangeState =
  | { kind: 'idle' }
  | { kind: 'playing'; id: string; key: string; index: number; loading: boolean }
  | { kind: 'stalled'; id: string; key: string; index: number };

/** A timer that fires this close to the end has reached it: about a frame. */
export const RANGE_END_TOLERANCE_MS = 30;
/** How soon a timer that fired early looks again, at the least. */
const RANGE_RECHECK_MS = 50;
/** Clips this close together play straight on: a jump would only freeze and fade for nothing. */
export const RANGE_JOIN_GAP_MS = 150;
/**
 * How long a start may take before the range calls it stalled. Long enough for a slow resume to
 * confirm (the hold before it has its own 3 s backstop); a start that comes later still recovers.
 */
export const RANGE_STALL_MS = 6_000;

export type RangeStep =
  | { kind: 'wait'; remainingMs: number }
  | { kind: 'continue'; index: number }
  | { kind: 'jump'; index: number; toMs: number }
  | { kind: 'end' };

/**
 * A clip that runs to the media's end ends this much before it, so its end timer gets there while
 * the pair is still playing and the jump to the next clip runs on a playing pair.
 */
export const RANGE_MEDIA_END_LEAD_MS = 2 * PLAYBACK_END_EPSILON_MS;

/** The latest a segment can end: `RANGE_MEDIA_END_LEAD_MS` before the media does. */
function mediaStopMs(mediaEndMs: number | null) {
  return mediaEndMs === null ? Infinity : mediaEndMs - RANGE_MEDIA_END_LEAD_MS;
}

/**
 * The player has stopped, or is stopping, at the end of the media: the playback hook's own
 * `playbackEnded` test. Null `mediaEndMs` (not known yet) is never the end.
 */
export function atMediaEnd(positionMs: number, mediaEndMs: number | null) {
  return mediaEndMs !== null && positionMs >= mediaEndMs - PLAYBACK_END_EPSILON_MS;
}

/**
 * What to do with the range at `positionMs`, playing segment `index`. Pure. A segment ends where
 * it says or where the media does, whichever is first: past the media's end the player has
 * stopped itself, and that is the end of the segment, not a stall.
 */
export function nextRangeStep(
  segments: readonly PlaySegment[],
  index: number,
  positionMs: number,
  mediaEndMs: number | null = null
): RangeStep {
  const segment = segments[index];
  if (!segment) return { kind: 'end' };
  const remainingMs = Math.min(segment.end_ms, mediaStopMs(mediaEndMs)) - positionMs;
  if (remainingMs > RANGE_END_TOLERANCE_MS) return { kind: 'wait', remainingMs };
  const next = segments[index + 1];
  if (!next) return { kind: 'end' };
  // Already there (two clips that touch): carry on rather than freeze and fade over nothing.
  if (Math.abs(next.start_ms - positionMs) < RANGE_JOIN_GAP_MS) return { kind: 'continue', index: index + 1 };
  return { kind: 'jump', index: index + 1, toMs: next.start_ms };
}

/**
 * The stretches a reel plays, in order: each clip's played cut, what geo-chat will publish. A
 * carried reel has none (its cuts are on the old video's clock), so it plays each clip's own span,
 * shown as approximate. Any other clip without a played cut is skipped: it can't publish.
 */
export function reelSegments(
  clips: readonly EditorClip[],
  played: readonly ({ start_ms: number; end_ms: number } | null)[],
  carried: boolean
): PlaySegment[] {
  const segments: PlaySegment[] = [];
  clips.forEach((clip, index) => {
    const span = played[index] ?? (carried ? clip : null);
    if (span && span.end_ms > span.start_ms)
      segments.push({ key: clip.key, start_ms: span.start_ms, end_ms: span.end_ms });
  });
  return segments;
}

type Run = {
  id: string;
  segments: PlaySegment[];
  index: number;
  /** The clip list this run started from; any change to it stops the run. */
  clipsKey: string;
  loading: boolean;
  stalled: boolean;
  /** Asked to play and not yet seen playing. */
  awaitingPlay: boolean;
};

/**
 * Plays clips through the editor's player and stops at their ends (GEO-3773).
 *
 * Drives the player only through its handle's primitives. Every start and every jump between clips
 * goes through `jumpTo`, so both recordings start together (GEO-2965). The end is timed off the wall
 * clock at the current speed, re-armed whenever the speed, play state or the player's position
 * changes, and backed by the position itself: a position at or past the end ends the segment at
 * once, which is what catches a timer a background tab throttled.
 *
 * Wire `onPlayhead` to the player's raw position callback, `onTransition` to its
 * `onJumpTransition`, and pass `playing` / `failed` from its playback state.
 */
export function usePlayRange({
  handle,
  rate,
  playing,
  failed = false,
  clipsKey,
  onEnd,
}: {
  handle: React.RefObject<DebateFeedPlayerHandle | null>;
  rate: number;
  playing: boolean;
  /** The player reports an error or a refused start. */
  failed?: boolean;
  /** Changes whenever the clips change (a refetch, an edit, a reorder): a run stops on any change. */
  clipsKey: string;
  /** The last segment finished and the player was paused there. */
  onEnd?: (id: string) => void;
}) {
  const [state, setState] = React.useState<PlayRangeState>({ kind: 'idle' });
  const runRef = React.useRef<Run | null>(null);
  const endTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stallTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Starts the next segment after the player stopped itself at the media's end; see `check`. */
  const restartTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rateRef = React.useRef(rate);
  const playingRef = React.useRef(playing);
  const onEndRef = React.useRef(onEnd);
  /** Inside one of our own `jumpTo` calls; a `cancel` reported then is the jump it replaced. */
  const jumpingRef = React.useRef<{ released: boolean } | null>(null);
  /** We paused the player ourselves, so the `playing` edge that follows is not a stall. */
  const selfPausedRef = React.useRef(false);

  React.useLayoutEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  const publish = React.useCallback(() => {
    const run = runRef.current;
    if (!run) {
      setState({ kind: 'idle' });
      return;
    }
    const key = run.segments[run.index].key;
    setState(
      run.stalled
        ? { kind: 'stalled', id: run.id, key, index: run.index }
        : { kind: 'playing', id: run.id, key, index: run.index, loading: run.loading }
    );
  }, []);

  const clearTimers = React.useCallback(() => {
    clearTimeout(endTimerRef.current);
    clearTimeout(stallTimerRef.current);
    clearTimeout(restartTimerRef.current);
  }, []);

  const mediaEndMs = React.useCallback(() => handle.current?.endMs() ?? null, [handle]);

  const stop = React.useCallback(() => {
    clearTimers();
    if (!runRef.current) return;
    runRef.current = null;
    publish();
  }, [clearTimers, publish]);

  const stall = React.useCallback(() => {
    const run = runRef.current;
    if (!run || run.stalled) return;
    clearTimers();
    run.stalled = true;
    run.loading = false;
    run.awaitingPlay = false;
    publish();
  }, [clearTimers, publish]);

  const armStallTimer = React.useCallback(() => {
    clearTimeout(stallTimerRef.current);
    stallTimerRef.current = setTimeout(() => {
      const run = runRef.current;
      if (run && run.awaitingPlay && !run.loading) stall();
    }, RANGE_STALL_MS);
  }, [stall]);

  /** Jump to `toMs` through the hold; true when the run is still going. */
  const jump = React.useCallback(
    (run: Run, toMs: number) => {
      const player = handle.current;
      if (!player) {
        stop();
        return false;
      }
      const jumping = { released: false };
      jumpingRef.current = jumping;
      let outcome: 'held' | 'seeked';
      try {
        outcome = player.jumpTo(toMs);
      } finally {
        jumpingRef.current = null;
      }
      run.loading = outcome === 'held' && !jumping.released;
      if (!run.loading) {
        if (!playingRef.current) {
          run.awaitingPlay = true;
          armStallTimer();
        }
      } else run.awaitingPlay = true;
      return true;
    },
    [armStallTimer, handle, stop]
  );

  // Declared before `check` uses it through the ref below; see `arm`.
  const checkRef = React.useRef<(positionMs: number | null) => void>(() => {});

  /** Time the current segment's end off the wall clock, at the current speed. */
  const arm = React.useCallback(
    (positionMs: number) => {
      clearTimeout(endTimerRef.current);
      const run = runRef.current;
      if (!run || run.loading || run.stalled || !playingRef.current) return;
      const step = nextRangeStep(run.segments, run.index, positionMs, mediaEndMs());
      if (step.kind !== 'wait') return;
      endTimerRef.current = setTimeout(
        () => checkRef.current(handle.current?.livePositionMs() ?? null),
        Math.max(RANGE_RECHECK_MS, step.remainingMs / rateRef.current)
      );
    },
    [handle, mediaEndMs]
  );

  /**
   * Start segment `index` after the player stopped itself at the media's end, as `start` does:
   * `play()` then the jump. From a timer, not from the effect that noticed the end: restarting an
   * ended player commits a reset synchronously, which React can't do inside an effect, and a reset
   * committed later would drop the jump's hold.
   */
  const restart = React.useCallback(
    (run: Run, index: number) => {
      if (runRef.current !== run || run.loading || run.stalled) return;
      const player = handle.current;
      if (!player) {
        stop();
        return;
      }
      run.index = index;
      const { start_ms } = run.segments[index];
      player.play();
      if (!jump(run, start_ms)) return;
      publish();
      if (!run.loading) arm(player.livePositionMs() ?? start_ms);
    },
    [arm, handle, jump, publish, stop]
  );

  /** Where the player is now: end, move on, or wait for the end. */
  const check = React.useCallback(
    (positionMs: number | null) => {
      const run = runRef.current;
      if (!run || run.loading || run.stalled) return;
      if (positionMs === null) {
        clearTimeout(endTimerRef.current);
        endTimerRef.current = setTimeout(
          () => checkRef.current(handle.current?.livePositionMs() ?? null),
          RANGE_RECHECK_MS
        );
        return;
      }
      const mediaEnd = mediaEndMs();
      const step = nextRangeStep(run.segments, run.index, positionMs, mediaEnd);
      if (step.kind === 'wait') {
        arm(positionMs);
        return;
      }
      clearTimers();
      if (step.kind === 'end') {
        runRef.current = null;
        selfPausedRef.current = true;
        handle.current?.pause();
        publish();
        onEndRef.current?.(run.id);
        return;
      }
      if (atMediaEnd(positionMs, mediaEnd)) {
        // The player stops itself here, in the same render that reports this position, so it is
        // not playing on into a jump: start the next segment the way a paused pair starts.
        const { index } = step;
        restartTimerRef.current = setTimeout(() => restart(run, index), 0);
        return;
      }
      run.index = step.index;
      if (step.kind === 'jump' && !jump(run, step.toMs)) return;
      publish();
      if (!run.loading) arm(handle.current?.livePositionMs() ?? positionMs);
    },
    [arm, clearTimers, handle, jump, mediaEndMs, publish, restart]
  );
  React.useLayoutEffect(() => {
    checkRef.current = check;
  }, [check]);

  /**
   * Play `segments` in order from the first one's start; from inside the click that asked. Returns
   * the keys of the segments it skipped because they start where the media has already ended, so
   * the caller can say so: with none left, nothing plays.
   */
  const start = React.useCallback(
    (id: string, segments: readonly PlaySegment[]): string[] => {
      clearTimers();
      // A segment that starts where the media has already ended has nothing to play.
      const stopMs = mediaStopMs(mediaEndMs());
      const pastEnd = segments.filter(segment => segment.start_ms >= stopMs).map(segment => segment.key);
      const playable = segments.filter(segment => segment.end_ms > segment.start_ms && segment.start_ms < stopMs);
      const player = handle.current;
      if (playable.length === 0 || !player) {
        stop();
        return pastEnd;
      }
      const run: Run = {
        id,
        segments: playable,
        index: 0,
        clipsKey,
        loading: false,
        stalled: false,
        awaitingPlay: false,
      };
      runRef.current = run;
      // Paused: start the pair inside this click, then move it under the hold, which resumes it.
      // Never a seek and then a play on a running pair, which starts one panel before the other.
      if (!playingRef.current) player.play();
      if (!jump(run, playable[0].start_ms)) return pastEnd;
      publish();
      if (!run.loading) arm(player.livePositionMs() ?? playable[0].start_ms);
      return pastEnd;
    },
    [arm, clearTimers, clipsKey, handle, jump, mediaEndMs, publish, stop]
  );

  /** Play again after a stall: the current segment, from where it stopped if that is inside it. */
  const retry = React.useCallback(() => {
    const run = runRef.current;
    const player = handle.current;
    if (!run || !run.stalled || !player) return;
    const segment = run.segments[run.index];
    const live = player.livePositionMs();
    const endMs = Math.min(segment.end_ms, mediaStopMs(mediaEndMs()));
    const from = live !== null && live >= segment.start_ms && live < endMs ? live : segment.start_ms;
    run.stalled = false;
    if (!playingRef.current) player.play();
    if (!jump(run, from)) return;
    publish();
    if (!run.loading) arm(player.livePositionMs() ?? from);
  }, [arm, handle, jump, mediaEndMs, publish]);

  /** The player's raw position, in ms; every report re-arms the end, and one past it ends now. */
  const onPlayhead = React.useCallback((positionMs: number) => checkRef.current(positionMs), []);

  const onTransition = React.useCallback(
    (phase: 'start' | 'release' | 'cancel') => {
      const jumping = jumpingRef.current;
      if (jumping) {
        // Inside our own jump: a release can come at once (a hidden tab); a cancel is the jump
        // this one replaced.
        if (phase === 'release') jumping.released = true;
        return;
      }
      const run = runRef.current;
      if (!run || !run.loading) return;
      if (phase === 'cancel') {
        stall();
        return;
      }
      if (phase === 'release') {
        run.loading = false;
        if (playingRef.current) run.awaitingPlay = false;
        else armStallTimer();
        publish();
        arm(handle.current?.livePositionMs() ?? run.segments[run.index].start_ms);
      }
    },
    [arm, armStallTimer, handle, publish, stall]
  );

  // Speed: re-time the end at the new rate.
  React.useEffect(() => {
    rateRef.current = rate;
    const live = handle.current?.livePositionMs() ?? null;
    if (live !== null) arm(live);
  }, [arm, handle, rate]);

  // Play state: a start we asked for arrives; a stop we did not ask for is a stall.
  React.useEffect(() => {
    const was = playingRef.current;
    playingRef.current = playing;
    const run = runRef.current;
    if (playing) {
      selfPausedRef.current = false;
      if (!run) return;
      run.awaitingPlay = false;
      clearTimeout(stallTimerRef.current);
      if (run.stalled) {
        // A slow start that came after all.
        run.stalled = false;
        publish();
      }
      if (!run.loading) checkRef.current(handle.current?.livePositionMs() ?? null);
      return;
    }
    clearTimeout(endTimerRef.current);
    if (selfPausedRef.current) {
      selfPausedRef.current = false;
      return;
    }
    // A jump's hold pauses the elements on purpose; its own release or cancel says how it ended.
    if (!was || !run || run.loading || run.stalled) return;
    // Ended or stalled, decided off where the player is: stopped at the media's end (the debate
    // ended inside or at the end of this clip, before the end timer fired), the clip is over and
    // the range moves on or ends; stopped anywhere else, something stopped it.
    const live = handle.current?.livePositionMs() ?? null;
    if (live !== null) {
      const mediaEnd = mediaEndMs();
      if (atMediaEnd(live, mediaEnd) || nextRangeStep(run.segments, run.index, live, mediaEnd).kind === 'end') {
        checkRef.current(live);
        return;
      }
    }
    stall();
  }, [handle, mediaEndMs, playing, publish, stall]);

  // The player failed or was refused while a run wanted it playing.
  React.useEffect(() => {
    if (failed && runRef.current && !runRef.current.loading) stall();
  }, [failed, stall]);

  // The clips changed under the run: what it was playing may be gone or moved.
  React.useEffect(() => {
    const run = runRef.current;
    if (!run || run.clipsKey === clipsKey) return;
    stop();
    selfPausedRef.current = true;
    handle.current?.pause();
  }, [clipsKey, handle, stop]);

  React.useEffect(() => clearTimers, [clearTimers]);

  return {
    state,
    /** A range is playing or waiting to: the player's automatic break cuts stay off meanwhile. */
    active: state.kind !== 'idle',
    start,
    stop,
    retry,
    onPlayhead,
    onTransition,
  };
}
