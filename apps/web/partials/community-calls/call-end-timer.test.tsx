import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BELOW_QUORUM_GRACE_MS, CALL_HARD_CAP_MS } from '~/core/community-calls/call-deadline';
import { LIVE_MEETING_GRACE_MINUTES } from '~/core/community-calls/constants';

import { CallEndTimer } from './call-end-timer';

const MINUTE = 60 * 1000;
const START = Date.UTC(2026, 8, 23, 18, 0);
const END = START + 60 * MINUTE;
const OLD_CUTOFF = END + LIVE_MEETING_GRACE_MINUTES * MINUTE;
const CAP = START + CALL_HARD_CAP_MS;

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function renderTimer(connectedCount: number, onTimeUp: () => void) {
  const props = { startMs: START, endMs: END, extensionMs: 0, onTimeUp };
  const view = render(<CallEndTimer {...props} connectedCount={connectedCount} />);
  return {
    setConnected: (n: number) => view.rerender(<CallEndTimer {...props} connectedCount={n} />),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CallEndTimer — GEO-2584 keepalive', () => {
  it('keeps the call up past the old cutoff while two or more are connected', () => {
    vi.setSystemTime(OLD_CUTOFF - 10 * MINUTE);
    const onTimeUp = vi.fn();
    renderTimer(2, onTimeUp);

    advance(30 * MINUTE); // 20 minutes past where the call used to end
    expect(onTimeUp).not.toHaveBeenCalled();
    expect(screen.queryByText(/This call will end/)).not.toBeInTheDocument();
  });

  it('ends the call once it falls below two, after a short grace', () => {
    vi.setSystemTime(OLD_CUTOFF + 5 * MINUTE);
    const onTimeUp = vi.fn();
    const { setConnected } = renderTimer(3, onTimeUp);

    advance(5 * MINUTE);
    setConnected(1);
    expect(screen.getByText(/Everyone else has left/)).toBeInTheDocument();

    advance(BELOW_QUORUM_GRACE_MS - 2000);
    expect(onTimeUp).not.toHaveBeenCalled();
    advance(3000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('rides out a blip: someone returning inside the grace keeps the call up', () => {
    vi.setSystemTime(OLD_CUTOFF + 5 * MINUTE);
    const onTimeUp = vi.fn();
    const { setConnected } = renderTimer(2, onTimeUp);

    setConnected(1);
    advance(20 * 1000);
    setConnected(2);
    advance(10 * MINUTE);
    expect(onTimeUp).not.toHaveBeenCalled();
  });

  it('still ends a lone participant at the old cutoff', () => {
    vi.setSystemTime(OLD_CUTOFF - 10 * MINUTE);
    const onTimeUp = vi.fn();
    renderTimer(1, onTimeUp);

    advance(10 * MINUTE - 2000);
    expect(onTimeUp).not.toHaveBeenCalled();
    advance(3000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });

  it('ends at the 2h cap however many are connected, with the countdown shown first', () => {
    vi.setSystemTime(CAP - 10 * MINUTE);
    const onTimeUp = vi.fn();
    renderTimer(8, onTimeUp);

    advance(6 * MINUTE);
    expect(screen.getByText(/This call will end in 4m/)).toBeInTheDocument();
    advance(4 * MINUTE - 2000);
    expect(onTimeUp).not.toHaveBeenCalled();
    advance(3000);
    expect(onTimeUp).toHaveBeenCalledTimes(1);

    advance(MINUTE);
    expect(onTimeUp).toHaveBeenCalledTimes(1);
  });
});
