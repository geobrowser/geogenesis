'use client';

import * as React from 'react';

/**
 * How far past the last playhead sample the animation may run on its own. The playhead arrives about
 * four times a second, from `timeupdate`; between samples the frame loop carries the time on, but
 * never further than this, so a stalled video does not leave its graphics running ahead of it.
 */
const MAX_AHEAD_MS = 500;

/** A gap between the drawn clock and the playhead wider than this is a jump (a scrub), not drift. */
export const BREAK_CLOCK_SNAP_MS = 400;

/** The share of the remaining drift taken in each frame: gone within a few frames, never a jump. */
const BREAK_CLOCK_EASE = 0.1;

/** Smooth fallback correction at the same rate on 60 Hz and high-refresh displays. */
export function advanceBreakClock(displayedMs: number, targetMs: number, frameMs: number, playedMs: number) {
  const drift = targetMs - displayedMs;
  if (Math.abs(drift) > BREAK_CLOCK_SNAP_MS) return Math.min(playedMs, Math.max(0, targetMs));
  return Math.min(
    playedMs,
    displayedMs + Math.max(0, frameMs + drift * (1 - (1 - BREAK_CLOCK_EASE) ** (frameMs / (1_000 / 60))))
  );
}

/**
 * One frame clock for Open rounds announcements, picks and early-end labels. Read the media clock
 * directly so buffering and seeking cannot leave the graphics running independently of the video.
 * If the element is temporarily unavailable, interpolate between samples with a bounded fallback.
 * The inherited --break-t property drives paused CSS animations without rendering React per frame.
 */
export function usePlaybackAnimationClock(
  ref: React.RefObject<HTMLDivElement | null>,
  cue: { elapsedMs: number; playedMs: number } | null,
  playing: boolean,
  source?: { positionMs: () => number | null; originMs: number; resetKey?: string | number },
  onTime?: (elapsedMs: number | null, fromFrame: boolean) => void
) {
  const sourceRef = React.useRef(source);
  const onTimeRef = React.useRef(onTime);
  React.useLayoutEffect(() => {
    sourceRef.current = source;
    onTimeRef.current = onTime;
  });
  const sample = React.useRef<{ elapsedMs: number; at: number; originMs?: number; resetKey?: string | number }>({
    elapsedMs: 0,
    at: 0,
  });
  const displayed = React.useRef<number | null>(null);
  const elapsedMs = cue?.elapsedMs ?? null;
  const playedMs = cue?.playedMs ?? 0;
  const originMs = source?.originMs;
  const resetKey = source?.resetKey;

  const write = React.useCallback(
    (ms: number, fromFrame = false, reset = false) => {
      const previous = displayed.current;
      // Media reads can wobble backwards slightly. Re-crossing a phase boundary replayed the
      // title's exit and hid already-restored names/counters. Keep small corrections monotonic;
      // explicit seeks/replays reset even a tiny jump. Callers without a seek key still follow large jumps.
      const managedSeeks = sourceRef.current?.resetKey !== undefined;
      const next =
        !reset && previous !== null && ms < previous && (managedSeeks || previous - ms <= BREAK_CLOCK_SNAP_MS)
          ? previous
          : ms;
      displayed.current = next;
      ref.current?.style.setProperty('--break-t', String(next));
      onTimeRef.current?.(next, fromFrame);
    },
    [ref]
  );

  React.useLayoutEffect(() => {
    if (elapsedMs === null) {
      // Retain the last cue's progress across unmounting. A late sample may briefly put that
      // same cue back on the page while its media element is unavailable.
      onTimeRef.current?.(null, false);
      return;
    }
    const reset = sample.current.originMs !== originMs || sample.current.resetKey !== resetKey;
    sample.current = { elapsedMs, at: performance.now(), originMs, resetKey };
    if (
      !playing ||
      displayed.current === null ||
      reset ||
      Math.abs(displayed.current - elapsedMs) > BREAK_CLOCK_SNAP_MS
    ) {
      const currentSource = sourceRef.current;
      const live = currentSource?.positionMs();
      write(
        Math.min(playedMs, Math.max(0, live == null || !currentSource ? elapsedMs : live - currentSource.originMs)),
        false,
        reset
      );
    } else {
      onTimeRef.current?.(displayed.current, false);
    }
  }, [elapsedMs, onTime, originMs, playedMs, playing, resetKey, write]);

  const shown = elapsedMs !== null;
  React.useEffect(() => {
    if (!shown || !playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const { elapsedMs: sampled, at } = sample.current;
      const currentSource = sourceRef.current;
      const live = currentSource?.positionMs();
      if (live != null && currentSource) {
        // Read the media clock directly when available: buffering, pause and seeking hold the
        // graphic with the footage rather than letting a wall clock finish its animation.
        write(Math.min(playedMs, Math.max(0, live - currentSource.originMs)), true);
      } else {
        const target = sampled + Math.min(now - at, MAX_AHEAD_MS);
        write(
          Math.min(
            sampled + MAX_AHEAD_MS,
            advanceBreakClock(displayed.current ?? target, target, now - last, playedMs)
          ),
          true
        );
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playedMs, playing, shown, write]);
}

/**
 * Holds a CSS animation at the playhead: `--break-t`, ms into the break, less `startMs`, the moment
 * the animation begins. The keyframes run as written, and a viewer who scrubs or pauses mid-break
 * finds the motion exactly where the video is.
 */
export function heldAt(startMs: number): React.CSSProperties {
  return { animationDelay: `calc(${startMs}ms - var(--break-t, 0) * 1ms)`, animationPlayState: 'paused' };
}
