import { describe, expect, it } from 'vitest';

import { createPlaybackMeasurement } from './playback-analytics';

const sample = (now: number, mediaMs: number, eligible = true) => ({
  now,
  mediaMs,
  eligible,
  durationMs: 100_000,
  muted: true,
  trigger: 'autoplay' as const,
});

describe('playback evidence', () => {
  it('flushes bounded advancing chunks and never credits a seek or background gap', () => {
    const events: Array<Record<string, unknown>> = [];
    const clock = createPlaybackMeasurement(properties => events.push(properties));
    clock.sample(sample(0, 0));
    clock.sample(sample(1000, 1000));
    clock.sample(sample(2000, 2000));
    clock.sample(sample(3000, 70_000));
    clock.sample(sample(4000, 71_000));
    clock.sample(sample(5000, 72_000, false));
    clock.sample(sample(60_000, 90_000));
    clock.sample(sample(61_000, 91_000));
    clock.flush();
    clock.flush();
    expect(events.map(e => [e.media_start_ms, e.media_end_ms, e.active_ms])).toEqual([
      [0, 2000, 2000],
      [70_000, 71_000, 1000],
      [90_000, 91_000, 1000],
    ]);
    expect(events.map(e => e.interval_sequence)).toEqual([1, 2, 3]);
    expect(events.map(e => Number(e.interval_end_ms) - Number(e.interval_start_ms))).toEqual([2000, 1000, 1000]);
  });

  it('splits replay, stalled media, mute changes and terminal events without counting wall time', () => {
    const events: Array<Record<string, unknown>> = [];
    const clock = createPlaybackMeasurement(properties => events.push(properties));
    clock.sample(sample(0, 0));
    clock.sample(sample(1000, 1000));
    clock.sample(sample(2000, 1000));
    clock.sample(sample(3000, 0));
    clock.sample({ ...sample(4000, 1000), muted: false });
    clock.sample({ ...sample(5000, 2000), muted: false });
    clock.break();
    clock.sample(sample(6000, 9000));
    clock.flush();
    expect(events.map(e => [e.media_start_ms, e.media_end_ms])).toEqual([
      [0, 1000],
      [1000, 2000],
    ]);
  });

  it('does not inflate short exposures into qualified views or credit suspended timers', () => {
    const events: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 20; i++) {
      const clock = createPlaybackMeasurement(properties => events.push(properties));
      clock.sample(sample(0, 0));
      clock.sample(sample(1000, 1000));
      clock.sample(sample(2000, 2000));
      clock.sample(sample(62_000, 62_000));
      clock.break();
    }
    expect(events).toHaveLength(20);
    expect(events.every(e => e.active_ms === 2000 && !('qualified' in e))).toBe(true);
  });
});
