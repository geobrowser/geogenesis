import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordingCornerIndicator } from './recording-corner-indicator';
import { RecordingCountdownRing } from './recording-countdown-ring';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const timer = (seconds: number) => (
  <RecordingCountdownRing
    remainingSeconds={seconds}
    progress={1 - seconds / 60}
    variant="default"
    buildUp={{ remainingMs: seconds * 1000 }}
  />
);

describe('RecordingCornerIndicator', () => {
  it('keeps one surface through the red timer, muted microphone and next timer', () => {
    vi.useFakeTimers();
    const view = render(<RecordingCornerIndicator participant="local" muted={false} countdown={timer(4)} />);
    const badge = screen.getByLabelText('Phase timer: 4 seconds remaining');
    const face = badge.querySelector('[data-recording-badge-face]');
    const warning = badge.querySelector('[data-recording-warning-surface]');
    expect(badge).toHaveStyle({ scale: '1.3' });
    expect(warning).toHaveStyle({ opacity: 1, transitionDuration: '0ms' });

    view.rerender(<RecordingCornerIndicator participant="local" muted countdown={null} />);
    expect(screen.getByLabelText('Microphone muted')).toBe(badge);
    expect(badge.querySelector('[data-recording-badge-face]')).toBe(face);
    expect(badge).toHaveStyle({ scale: '1', transitionDuration: '300ms' });
    expect(warning).toHaveStyle({ opacity: 0, transitionDuration: '300ms' });
    expect(face).toHaveStyle({ animationPlayState: 'paused', '--turn-timer-swell': '1' });
    expect(badge.querySelector('[data-muted-indicator] path')).toHaveAttribute('fill-opacity', '0');

    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    expect(badge.querySelector('[data-turn-timer-rim]')).toBeNull();

    view.rerender(<RecordingCornerIndicator participant="local" muted={false} countdown={timer(30)} />);
    expect(screen.getByLabelText('Phase timer: 30 seconds remaining')).toBe(badge);
    expect(badge.querySelector('[data-recording-badge-face]')).toBe(face);
    expect(screen.getByText('30').parentElement).toHaveStyle({ transitionDelay: '100ms', transitionDuration: '150ms' });
    act(() => vi.advanceTimersByTime(300));
    expect(badge.querySelector('[data-muted-indicator]')).toBeNull();
  });

  it('reverses an interrupted End turn without remounting or a stale cleanup removing the timer', () => {
    vi.useFakeTimers();
    const view = render(<RecordingCornerIndicator participant="local" muted={false} countdown={timer(8)} />);
    const number = screen.getByText('8');
    const badge = screen.getByLabelText('Phase timer: 8 seconds remaining');
    view.rerender(<RecordingCornerIndicator participant="local" muted countdown={null} />);
    act(() => vi.advanceTimersByTime(50));
    view.rerender(<RecordingCornerIndicator participant="local" muted={false} countdown={timer(8)} />);
    expect(screen.getByText('8')).toBe(number);
    expect(screen.getByLabelText('Phase timer: 8 seconds remaining')).toBe(badge);
    act(() => vi.advanceTimersByTime(500));
    expect(number).toBeInTheDocument();
    expect(badge.querySelector('[data-muted-indicator]')).toBeNull();
  });

  it('shows a speaker who is still finishing past the buzzer as finishing, not muted (GEO-3407)', () => {
    const view = render(
      <RecordingCornerIndicator participant="remote" muted={false} countdown={null} finishingSince={Date.now()} />
    );
    expect(screen.getByRole('img', { name: 'Finishing their sentence' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Microphone muted')).not.toBeInTheDocument();

    view.rerender(<RecordingCornerIndicator participant="remote" muted countdown={null} finishingSince={null} />);
    expect(screen.getByLabelText('Microphone muted')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Finishing their sentence' })).not.toBeInTheDocument();
  });
});
