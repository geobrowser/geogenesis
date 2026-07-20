import { describe, expect, it } from 'vitest';

import { clampSeconds, normalizeTurnDurationsMs, timelineSecondsFor, turnStateForTime } from './playback-utils';

describe('normalizeTurnDurationsMs', () => {
  it('keeps finite positive durations', () => {
    expect(normalizeTurnDurationsMs([30_000, 45_000])).toEqual([30_000, 45_000]);
  });

  it('drops non-finite, zero, and negative values', () => {
    expect(normalizeTurnDurationsMs([Number.NaN, -5, 0, 1_000, Infinity])).toEqual([1_000]);
  });

  it('falls back to a two-turn default when nothing survives', () => {
    expect(normalizeTurnDurationsMs([])).toEqual([30_000, 30_000]);
    expect(normalizeTurnDurationsMs([0, -1, Number.NaN])).toEqual([30_000, 30_000]);
  });
});

describe('timelineSecondsFor', () => {
  it('sums durations in seconds', () => {
    expect(timelineSecondsFor([30_000, 30_000])).toBe(60);
  });

  it('is zero for an empty timeline', () => {
    expect(timelineSecondsFor([])).toBe(0);
  });
});

describe('clampSeconds', () => {
  it('passes through in-range values', () => {
    expect(clampSeconds(5, 10)).toBe(5);
  });

  it('clamps to the [0, duration] bounds', () => {
    expect(clampSeconds(-1, 10)).toBe(0);
    expect(clampSeconds(15, 10)).toBe(10);
  });

  it('treats non-finite input or duration as zero', () => {
    expect(clampSeconds(Number.NaN, 10)).toBe(0);
    expect(clampSeconds(5, Number.NaN)).toBe(0);
    expect(clampSeconds(5, -3)).toBe(0);
  });
});

describe('turnStateForTime', () => {
  const durations = [1_000, 1_000];

  it('returns null when there are no turns', () => {
    expect(turnStateForTime(1, [], 0)).toBeNull();
  });

  it('reports the first speaker at the start', () => {
    expect(turnStateForTime(1, durations, 0)).toEqual({ slot: 1, progress: 0, seconds: 1 });
  });

  it('tracks progress within a turn', () => {
    expect(turnStateForTime(1, durations, 0.5)).toEqual({ slot: 1, progress: 0.5, seconds: 0.5 });
  });

  it('alternates to the other speaker on the next turn boundary', () => {
    expect(turnStateForTime(1, durations, 1)).toEqual({ slot: 2, progress: 0, seconds: 1 });
  });

  it('respects the first speaker when it is slot 2', () => {
    expect(turnStateForTime(2, durations, 0)?.slot).toBe(2);
    expect(turnStateForTime(2, durations, 1.5)?.slot).toBe(1);
  });

  it('clamps to the final turn past the end of the timeline', () => {
    expect(turnStateForTime(1, durations, 2.5)).toEqual({ slot: 2, progress: 1, seconds: 0 });
  });
});
