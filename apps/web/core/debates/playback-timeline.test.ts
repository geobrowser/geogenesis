import { describe, expect, it } from 'vitest';

import { playbackTimeline } from './playback-timeline';

describe('edited playback timeline', () => {
  const cuts = [
    { atMs: 31_200, toMs: 36_800 },
    { atMs: 71_200, toMs: 80_800 },
    { atMs: 90_000, toMs: 93_000 },
    { atMs: 112_600, toMs: 120_000 },
  ];
  const timeline = playbackTimeline(cuts, 120_000);

  it('measures the footage the viewer actually watches, including the kept titles', () => {
    expect(timeline.durationMs).toBe(94_400);
    expect(timeline.toPlaybackMs(0)).toBe(0);
    expect(timeline.toPlaybackMs(38_000)).toBe(32_400);
    expect(timeline.toPlaybackMs(82_000)).toBe(66_800);
    expect(timeline.toPlaybackMs(120_000)).toBe(94_400);
  });

  it.each(cuts)('has no progress jump at $atMs → $toMs, including early ends and wrap', cut => {
    const before = timeline.toPlaybackMs(cut.atMs);
    expect(timeline.toPlaybackMs(cut.toMs)).toBe(before);
    expect(timeline.toPlaybackMs((cut.atMs + cut.toMs) / 2)).toBe(before);
    expect(timeline.toPlaybackMs(cut.atMs - 1)).toBe(before - 1);
    expect(timeline.toSourceMs(before)).toBe(cut.toMs);
  });

  it('round-trips seeks throughout every retained interval', () => {
    for (let rawMs = 0; rawMs < 120_000; rawMs += 50) {
      if (cuts.some(cut => rawMs >= cut.atMs && rawMs < cut.toMs)) continue;
      expect(timeline.toSourceMs(timeline.toPlaybackMs(rawMs))).toBe(rawMs);
    }
    for (const cut of cuts.slice(0, -1)) {
      expect(timeline.toPlaybackMs(cut.toMs + 1000) - timeline.toPlaybackMs(cut.toMs)).toBe(1000);
    }
  });

  it('keeps a debate without cuts on its original clock', () => {
    const fixed = playbackTimeline([], 120_000);
    expect(fixed.durationMs).toBe(120_000);
    expect(fixed.toPlaybackMs(85_250)).toBe(85_250);
    expect(fixed.toSourceMs(85_250)).toBe(85_250);
  });

  it('clips, sorts and merges overlapping cuts without modifying the metadata', () => {
    const unordered = [
      { atMs: 12_000, toMs: 30_000 },
      { atMs: -1000, toMs: 1000 },
      { atMs: 5000, toMs: 12_000 },
      { atMs: 10_000, toMs: 13_000 },
      { atMs: 3000, toMs: 3000 },
    ];
    const original = structuredClone(unordered);
    const clipped = playbackTimeline(unordered, 20_000);
    expect(clipped.durationMs).toBe(4000);
    expect(clipped.toPlaybackMs(3000)).toBe(2000);
    expect(clipped.toSourceMs(2000)).toBe(3000);
    expect(clipped.toSourceMs(4000)).toBe(20_000);
    expect(unordered).toEqual(original);
  });

  it('bounds both directions before metadata loads and outside the timeline', () => {
    expect(playbackTimeline(cuts, 0).durationMs).toBe(0);
    expect(playbackTimeline(cuts, 0).toSourceMs(1000)).toBe(0);
    expect(timeline.toPlaybackMs(-1000)).toBe(0);
    expect(timeline.toPlaybackMs(200_000)).toBe(timeline.durationMs);
    expect(timeline.toSourceMs(-1000)).toBe(0);
    expect(timeline.toSourceMs(200_000)).toBe(120_000);
  });
});
