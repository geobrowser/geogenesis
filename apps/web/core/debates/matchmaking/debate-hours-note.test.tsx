import { act, cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebateHoursNote } from './debate-hours-note';

/**
 * Pinned to Pacific so "9-10am local" is a fact rather than a coincidence of the machine running
 * the suite — the copy is the same shape everywhere, but only here can it be asserted literally.
 * `TZ` has to be set before jsdom's `Date` is first used for the process to honour it, which is why
 * every case reaches for it through the shared setup below.
 */
const originalTimeZone = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'America/Los_Angeles';
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  process.env.TZ = originalTimeZone;
});

function renderAt(iso: string) {
  vi.setSystemTime(new Date(iso));
  // The note renders nothing until its mount effect has run, so flush it the way the browser would.
  act(() => {
    render(<DebateHoursNote />);
  });
}

describe('DebateHoursNote', () => {
  it('points an outside-hours viewer at the window in their own local time', () => {
    // 15:00Z is 08:00 PDT — an hour before the window opens.
    renderAt('2026-09-08T15:00:00Z');

    expect(
      screen.getByText('Debate hours are every day between 9-10am. Come back then to join a debate!')
    ).toBeTruthy();
  });

  it('tells a viewer inside the window to stay', () => {
    renderAt('2026-09-08T16:30:00Z');

    expect(screen.getByText('Stay here and you’ll be matched as soon as someone joins.')).toBeTruthy();
  });

  // The boundary requirement: 8:59 shows one variant and 9:00 the other, with no refresh in between.
  it('flips at the start of the window without being re-rendered', () => {
    renderAt('2026-09-08T15:59:00Z');
    expect(screen.getByText(/Come back then/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(61_000 + 1_000);
    });

    expect(screen.queryByText(/Come back then/)).toBeNull();
    expect(screen.getByText('Stay here and you’ll be matched as soon as someone joins.')).toBeTruthy();
  });

  it('flips back when the window closes', () => {
    renderAt('2026-09-08T16:59:00Z');
    expect(screen.getByText(/Stay here/)).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(61_000 + 1_000);
    });

    expect(screen.getByText(/Come back then/)).toBeTruthy();
  });

  // A throttled or sleeping tab can miss its callback entirely, so returning to the tab has to be
  // enough on its own.
  it('re-reads the clock when the tab becomes visible again', () => {
    renderAt('2026-09-08T15:59:00Z');
    expect(screen.getByText(/Come back then/)).toBeTruthy();

    act(() => {
      // Time moved on without the timer firing, which is what a sleeping machine looks like.
      vi.setSystemTime(new Date('2026-09-08T16:30:00Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText(/Stay here/)).toBeTruthy();
  });

  it('stops its timer when unmounted', () => {
    renderAt('2026-09-08T15:59:00Z');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    act(() => {
      cleanup();
    });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
