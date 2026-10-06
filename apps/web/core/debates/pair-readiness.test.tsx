import { fireEvent, render } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePairReadiness } from '~/core/debates/pair-readiness';

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
