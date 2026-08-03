import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { RecordingCountdownRing } from './recording-countdown-ring';

const circumference = 2 * Math.PI * 21;

afterEach(cleanup);

describe('RecordingCountdownRing', () => {
  it('matches the processed-video geometry and typography', () => {
    render(<RecordingCountdownRing remainingSeconds={44} progress={1 / 45} variant="default" />);

    const timer = screen.getByLabelText('Phase timer: 44 seconds remaining');
    const svg = timer.querySelector('svg');
    const backdrop = timer.querySelector('[data-countdown-backdrop]');
    const track = timer.querySelector('[data-countdown-track]');
    const progress = timer.querySelector('[data-countdown-progress]');
    const number = screen.getByText('44');
    const stops = timer.querySelectorAll('stop');

    expect(timer).toHaveStyle({ width: '51px', height: '51px' });
    expect(timer).toHaveAttribute('data-muted-timer', 'false');
    expect(timer).toHaveAttribute('data-timer-progress', String(1 / 45));
    expect(svg).toHaveAttribute('viewBox', '0 0 51 51');
    expect(backdrop).toHaveAttribute('cx', '25.5');
    expect(backdrop).toHaveAttribute('cy', '25.5');
    expect(backdrop).toHaveAttribute('r', '25.5');
    expect(stops[0]).toHaveAttribute('stop-color', '#000000');
    expect(stops[0]).toHaveAttribute('stop-opacity', '0.5');
    expect(stops[1]).toHaveAttribute('stop-color', '#000000');
    expect(stops[1]).toHaveAttribute('stop-opacity', '0.25');
    expect(track).toHaveAttribute('cx', '25.5');
    expect(track).toHaveAttribute('cy', '25.5');
    expect(track).toHaveAttribute('r', '21');
    expect(track).toHaveAttribute('stroke', '#FFFFFF');
    expect(track).toHaveAttribute('stroke-opacity', '0.6');
    expect(track).toHaveAttribute('stroke-width', '3');
    expect(progress).toHaveAttribute('r', '21');
    expect(progress).toHaveAttribute('stroke', '#FFFFFF');
    expect(progress).toHaveAttribute('stroke-width', '3');
    expect(progress).toHaveAttribute('stroke-linecap', 'butt');
    expect(progress).toHaveAttribute('stroke-dasharray', String(circumference));
    expect(progress).toHaveAttribute('stroke-dashoffset', String(circumference / 45));
    expect(progress).toHaveAttribute('transform', 'rotate(-90 25.5 25.5)');
    expect(number).toHaveStyle({
      color: '#FFFFFF',
      fontFamily: 'var(--font-geist-medium)',
      fontSize: '28px',
      fontWeight: '500',
      lineHeight: '1',
      transform: 'translateY(-1px)',
    });
  });

  it('uses the exact warning color only for the warning variant', () => {
    const view = render(<RecordingCountdownRing remainingSeconds={5} progress={5 / 6} variant="warning" />);

    expect(view.container.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FF4A26');
    expect(screen.getByText('5')).toHaveStyle({ color: '#FFFFFF' });

    view.rerender(<RecordingCountdownRing remainingSeconds={5} progress={5 / 6} variant="default" />);

    expect(view.container.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', '#FFFFFF');
  });

  it('preserves the subdued yielded-timer treatment', () => {
    render(<RecordingCountdownRing remainingSeconds={4} progress={2 / 3} variant="muted" />);

    const timer = screen.getByLabelText('Phase timer: 4 seconds remaining');
    expect(timer).toHaveAttribute('data-muted-timer', 'true');
    expect(timer.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke', 'rgba(190,190,190,0.92)');
    expect(screen.getByText('4')).toHaveStyle({ color: 'var(--color-grey-02)' });
  });

  it('clamps progress to the valid ring range', () => {
    const view = render(<RecordingCountdownRing remainingSeconds={45} progress={-0.25} variant="default" />);

    expect(view.container.querySelector('[data-countdown-progress]')).toHaveAttribute('stroke-dashoffset', '0');

    view.rerender(<RecordingCountdownRing remainingSeconds={0} progress={1.25} variant="default" />);

    expect(view.container.querySelector('[data-countdown-progress]')).toHaveAttribute(
      'stroke-dashoffset',
      String(circumference)
    );
  });

  it('creates a unique backdrop gradient for every timer', () => {
    render(
      <>
        <RecordingCountdownRing remainingSeconds={20} progress={0} variant="default" />
        <RecordingCountdownRing remainingSeconds={20} progress={0} variant="default" />
      </>
    );

    const timers = screen.getAllByLabelText('Phase timer: 20 seconds remaining');
    const gradientIds = timers.map(timer => timer.querySelector('linearGradient')?.id);
    const fillReferences = timers.map(timer => timer.querySelector('[data-countdown-backdrop]')?.getAttribute('fill'));

    expect(new Set(gradientIds).size).toBe(2);
    expect(fillReferences).toEqual(gradientIds.map(id => `url(#${id})`));
  });
});
