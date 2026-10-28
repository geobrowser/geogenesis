import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { notYetOpenLabel } from './lobby-format';
import { useMinuteNow } from './use-minute-now';

function Countdown({ opensAt }: { opensAt: string }) {
  const now = useMinuteNow();
  return <p>{notYetOpenLabel({ opens_at: opensAt }, now)}</p>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useMinuteNow', () => {
  it('moves a countdown along each minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 21, 30, 0));
    const opensAt = new Date(2026, 9, 5, 21, 50).toISOString();
    render(<Countdown opensAt={opensAt} />);
    expect(screen.getByText(/· in 20 min$/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(/· in 19 min$/)).toBeTruthy();
  });

  it('turns tomorrow into today past local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 23, 59, 0));
    const opensAt = new Date(2026, 9, 6, 9, 0).toISOString();
    render(<Countdown opensAt={opensAt} />);
    expect(screen.getByText(/· tomorrow$/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText(/· today$/)).toBeTruthy();
  });

  it('reads the clock again when the tab comes back', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 21, 30, 0));
    const opensAt = new Date(2026, 9, 5, 21, 50).toISOString();
    render(<Countdown opensAt={opensAt} />);
    // A throttled tab: the clock moves without the timer firing.
    vi.setSystemTime(new Date(2026, 9, 5, 21, 40, 30));
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText(/· in 10 min$/)).toBeTruthy();
  });
});
