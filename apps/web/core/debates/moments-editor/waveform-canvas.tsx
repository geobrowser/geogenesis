'use client';

import * as React from 'react';

import cx from 'classnames';

import { type MixedPeaks, peakColumns } from './waveform';

/**
 * A waveform drawn on a canvas sized to its box at the screen's pixel ratio: one column per device
 * pixel, each the loudest bucket it covers, mirrored about the middle. Its colour is its CSS `color`
 * (a `text-*` class), so it follows the design system's tokens. A browser without a 2D context (or
 * jsdom) draws nothing.
 */
export function WaveformCanvas({
  peaks,
  startMs,
  endMs,
  className,
}: {
  peaks: Pick<MixedPeaks, 'bucketMs' | 'samples'> | null;
  startMs: number;
  endMs: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const measure = () => setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || size.width <= 0 || size.height <= 0) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(size.width * ratio);
    const height = Math.round(size.height * ratio);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!peaks) return;
    context.fillStyle = getComputedStyle(canvas).color;
    const middle = height / 2;
    const columns = peakColumns(peaks, startMs, endMs, width);
    for (let x = 0; x < width; x += 1) {
      if (columns[x] === 0) continue;
      const half = Math.max(ratio / 2, (columns[x] / 255) * middle);
      context.fillRect(x, middle - half, 1, half * 2);
    }
  }, [peaks, startMs, endMs, size]);

  return <canvas ref={ref} aria-hidden className={cx('block', className)} />;
}
