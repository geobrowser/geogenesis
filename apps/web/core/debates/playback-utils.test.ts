import { describe, expect, it } from 'vitest';

import type { DebateMediaArtifactKind, DebateMediaResponse } from './api';
import {
  clampSeconds,
  hasProcessedVideo,
  normalizeTurnDurationsMs,
  playBothWithMutedFallback,
  recordingWindowOffsetsSeconds,
  timelineSecondsFor,
  turnStateForTime,
} from './playback-utils';

describe('hasProcessedVideo', () => {
  const media = (...kinds: DebateMediaArtifactKind[]) =>
    ({ artifacts: kinds.map(kind => ({ kind })) }) as unknown as DebateMediaResponse;

  it('accepts media carrying a composed final_video', () => {
    expect(hasProcessedVideo(media('final_video', 'preview_image'))).toBe(true);
  });

  it('rejects media without a final_video', () => {
    expect(hasProcessedVideo(media('preview_image', 'subtitle_vtt'))).toBe(false);
    expect(hasProcessedVideo(media())).toBe(false);
  });

  it('rejects an unresolved media lookup rather than assuming ready', () => {
    expect(hasProcessedVideo(undefined)).toBe(false);
  });

  // The hevc rendition is a companion to final_video, never a substitute for it.
  it('does not accept final_video_hevc alone', () => {
    expect(hasProcessedVideo(media('final_video_hevc'))).toBe(false);
  });
});

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

describe('recordingWindowOffsetsSeconds', () => {
  const windowStart = '2026-07-20T00:00:00.000Z';
  const windowStartMs = Date.parse(windowStart);

  it('anchors each recording to the debate start (matching the backend composite)', () => {
    // slot 1 started 500ms after the window opened; slot 2 started 2s after.
    const offsets = recordingWindowOffsetsSeconds(windowStart, windowStartMs + 500, windowStartMs + 2_000);
    expect(offsets.slot1).toBeCloseTo(0.5);
    expect(offsets.slot2).toBeCloseTo(2);
    // At debate-timeline P, each video plays at `P - offset`; the gap between the two
    // recordings (1.5s here) is what keeps them from talking over each other.
    expect(offsets.slot2 - offsets.slot1).toBeCloseTo(1.5);
  });

  it('handles a recording that began before the debate window', () => {
    const offsets = recordingWindowOffsetsSeconds(windowStart, windowStartMs - 1_000, windowStartMs);
    expect(offsets.slot1).toBeCloseTo(-1);
    expect(offsets.slot2).toBeCloseTo(0);
  });

  it('falls back to the earliest recording when the debate has no start timestamp', () => {
    const offsets = recordingWindowOffsetsSeconds(null, 10_000, 12_500);
    expect(offsets.slot1).toBeCloseTo(0);
    expect(offsets.slot2).toBeCloseTo(2.5);
  });

  it('treats missing or invalid timestamps as zero offset', () => {
    const offsets = recordingWindowOffsetsSeconds('not-a-date', null, Number.NaN);
    expect(offsets.slot1).toBe(0);
    expect(offsets.slot2).toBe(0);
  });
});

describe('playBothWithMutedFallback (GEO-2783)', () => {
  /**
   * A fake video whose `play()` refuses while it has audio, which is what the autoplay policy
   * does outside a user gesture. `blockUnmuted: false` models a gesture-driven play, where the
   * browser allows sound.
   */
  function fakeVideo({ muted, blockUnmuted = true }: { muted: boolean; blockUnmuted?: boolean }) {
    const video = {
      muted,
      paused: true,
      plays: 0,
      async play() {
        this.plays += 1;
        if (blockUnmuted && !this.muted) throw new Error('NotAllowedError');
        this.paused = false;
      },
    };
    return video;
  }

  it('plays straight away when the browser allows it', async () => {
    const a = fakeVideo({ muted: true });
    const b = fakeVideo({ muted: true });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing');
    expect([a.plays, b.plays]).toEqual([1, 1]);
  });

  /* The actual bug: unmuted autoplay is blocked, and the viewer used to get an error. */
  it('retries muted when unmuted autoplay is blocked, and says so', async () => {
    const a = fakeVideo({ muted: false });
    const b = fakeVideo({ muted: false });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing-muted');
    expect(a.muted).toBe(true);
    expect(b.muted).toBe(true);
    expect(a.paused).toBe(false);
  });

  it('retries when only one of the two is unmuted — the speaking slot is the audible one', async () => {
    const a = fakeVideo({ muted: false });
    const b = fakeVideo({ muted: true });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing-muted');
  });

  /* Already muted and still blocked means the cause is not the autoplay policy, so there is
     nothing to retry and reporting 'playing-muted' would be a lie. */
  it('does not retry when both were already muted', async () => {
    const a = fakeVideo({ muted: true, blockUnmuted: false });
    const b = fakeVideo({ muted: true, blockUnmuted: false });
    a.play = async () => {
      a.plays += 1;
    }; // resolves but stays paused
    expect(await playBothWithMutedFallback(a, b)).toBe('blocked');
    expect(a.plays).toBe(1);
  });

  /* A resolved play() that leaves the element paused is also a block — only one of the two
     failure shapes throws, which is why `paused` is checked as well as the promise. */
  it('treats a resolved-but-paused play as blocked', async () => {
    const a = fakeVideo({ muted: true });
    a.play = async () => {
      a.plays += 1;
    };
    const b = fakeVideo({ muted: true });
    expect(await playBothWithMutedFallback(a, b)).toBe('blocked');
  });

  it('keeps sound when the play is gesture-driven', async () => {
    const a = fakeVideo({ muted: false, blockUnmuted: false });
    const b = fakeVideo({ muted: false, blockUnmuted: false });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing');
    expect(a.muted).toBe(false);
  });
});
