import { fireEvent, render } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HELD_PAIR_RUNWAY_SECONDS,
  PAIR_HOLD_TIMEOUT_MS,
  bufferedAheadSeconds,
  heldPairMayResume,
  usePairReadiness,
} from '~/core/debates/pair-readiness';
import { timeRanges } from '~/core/debates/time-ranges-fixtures';

/**
 * GEO-3110. The hold's backstop (`PAIR_HOLD_TIMEOUT_MS`) is a real `setTimeout`, and
 * `debate-feed-player.test.tsx` renders the player that schedules it roughly eighty times without
 * ever unmounting — that suite has no automatic cleanup wired (see `vitest.setup.ts`'s note that
 * `setupTests.ts`, which would switch on global cleanup, is deliberately not referenced). A timer
 * leaked that way can fire after vitest tears a finished file's jsdom globals off `globalThis`
 * (`window`, `document`, ...), calling `setLatch` with `window` genuinely undefined —
 * `ReferenceError: window is not defined`, attributed to whichever file happened to be running
 * when the race lost. It is a flake rather than a guaranteed failure because it depends on how
 * quickly the runner recycles that file's worker relative to the backstop's 3000ms.
 *
 * `usePairReadiness`'s own cleanup already clears every timer it schedules — the `timers` `Set` in
 * the effect below is swept with `clearTimeout` on every unmount and every re-run. A leaked real
 * timer therefore requires a component that is rendered and never unmounted, which is the test
 * suite's bug rather than this hook's. This file pins the hook's half of that contract: once
 * unmounted, nothing it scheduled is left to fire.
 */
function Harness({ timeoutMs, active = true }: { timeoutMs?: number; active?: boolean } = {}) {
  const slot1Ref = React.useRef<HTMLVideoElement | null>(null);
  const slot2Ref = React.useRef<HTMLVideoElement | null>(null);
  usePairReadiness({
    pairKey: 'debate-1',
    slot1Ref,
    slot2Ref,
    slot1Src: 'https://cdn.test/slot1.webm',
    slot2Src: 'https://cdn.test/slot2.webm',
    active,
    timeoutMs,
  });
  return (
    <div>
      <video ref={slot1Ref} />
      <video ref={slot2Ref} />
    </div>
  );
}

describe('usePairReadiness cleanup (GEO-3110)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves nothing scheduled once unmounted, so the hold backstop cannot fire late', () => {
    const { unmount } = render(<Harness />);

    // The pair has sources and is active, so the 3s backstop (and nothing else, since jsdom's
    // stand-in <video> elements are never "stuck") is pending.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs no callback for a backstop scheduled before an unmount that beat it', () => {
    const { unmount } = render(<Harness timeoutMs={3_000} />);
    unmount();

    // The timer must already be gone the moment unmount returns — not merely left to fire once
    // (and be silently absorbed) when the clock is advanced. A timer that fires and runs its
    // callback also leaves the pending count at zero afterwards, so checking only post-advance
    // would pass even with the effect's cleanup deleted entirely.
    expect(vi.getTimerCount()).toBe(0);

    // Advancing the clock past where it would have fired must still do nothing: the exact leaked
    // call this ticket is about (`mark({ started: true })` against the unmounted tree).
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the shorter suspend-grace timer too, not only the backstop', () => {
    // A `suspend` event on either element starts `noteSuspended`'s own 250ms grace timer,
    // independent of (and shorter than) the 3s backstop — both must be swept on unmount.
    const { container, unmount } = render(<Harness />);
    const [slot1] = Array.from(container.querySelectorAll('video'));

    fireEvent(slot1, new Event('suspend'));
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

/** Two ranges with a hole between them, as a buffer looks after a seek past what was fetched. */
function twoRanges(): TimeRanges {
  const bounds = [
    [0, 10],
    [20, 30],
  ];
  return { length: 2, start: index => bounds[index][0], end: index => bounds[index][1] };
}

describe('bufferedAheadSeconds', () => {
  it('measures from the playhead to the end of the range holding it', () => {
    expect(bufferedAheadSeconds({ buffered: twoRanges() }, 4)).toBe(6);
    expect(bufferedAheadSeconds({ buffered: twoRanges() }, 25)).toBe(5);
  });

  it('counts a playhead on a range edge as inside it', () => {
    expect(bufferedAheadSeconds({ buffered: twoRanges() }, 20)).toBe(10);
    expect(bufferedAheadSeconds({ buffered: twoRanges() }, 10)).toBe(0);
  });

  it('is nothing in a hole between ranges, or with no ranges at all', () => {
    expect(bufferedAheadSeconds({ buffered: twoRanges() }, 15)).toBe(0);
    expect(bufferedAheadSeconds({}, 15)).toBe(0);
  });
});

/** GEO-3603: when a pair the player paused itself (a break's cut, a held resync) may play again. */
describe('heldPairMayResume', () => {
  const member = (overrides: Record<string, unknown> = {}) => ({
    readyState: 4,
    networkState: 1,
    error: null,
    seeking: false,
    currentTime: 50,
    duration: 300,
    buffered: timeRanges(40, 50 + HELD_PAIR_RUNWAY_SECONDS),
    ...overrides,
  });

  it('resumes once both can play with the runway buffered, and not a little short of it', () => {
    expect(heldPairMayResume(member(), member(), 0)).toBe(true);
    const short = member({ buffered: timeRanges(40, 50 + HELD_PAIR_RUNWAY_SECONDS - 0.1) });
    expect(heldPairMayResume(member(), short, 0)).toBe(false);
    expect(heldPairMayResume(member({ seeking: true }), member(), 0)).toBe(false);
  });

  // A cut near the end-card handoff can never have 3 s ahead; it must not wait out the backstop.
  it('resumes a recording buffered to its end, short of the runway', () => {
    const nearEnd = member({ currentTime: 298.5, duration: 300, buffered: timeRanges(290, 299.8) });
    expect(heldPairMayResume(member(), nearEnd, 0)).toBe(true);
    const notToEnd = member({ currentTime: 298.5, duration: 300, buffered: timeRanges(290, 299.5) });
    expect(heldPairMayResume(member(), notToEnd, 0)).toBe(false);
  });

  it('lets a failed recording go, for its own recovery to rebuild', () => {
    const failed = member({ readyState: 0, error: { code: 4 } });
    expect(heldPairMayResume(failed, member(), 0)).toBe(true);
  });

  it('plays whatever is ready at the backstop', () => {
    const starved = member({ readyState: 1, buffered: timeRanges(0, 0) });
    expect(heldPairMayResume(member(), starved, PAIR_HOLD_TIMEOUT_MS - 1)).toBe(false);
    expect(heldPairMayResume(member(), starved, PAIR_HOLD_TIMEOUT_MS)).toBe(true);
  });
});
