import { describe, expect, it } from 'vitest';

import type { DebateMediaArtifactKind, DebateMediaResponse } from './api';
import {
  clampSeconds,
  hasProcessedVideo,
  normalizeTurnDurationsMs,
  pairPlayhead,
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

describe('pairPlayhead (GEO-2947)', () => {
  const offsets = { slot1: 1, slot2: 3 };
  const video = (paused: boolean, currentTime: number) => ({ paused, currentTime });

  it('reads slot 1 while it is running', () => {
    expect(pairPlayhead(video(false, 10), video(false, 8), offsets)).toEqual({ seconds: 11, live: true });
  });

  it('falls back to slot 1 when both are paused', () => {
    expect(pairPlayhead(video(true, 10), video(true, 8), offsets)).toEqual({ seconds: 11, live: false });
  });

  /**
   * A hidden tab stops the element it considers silent. If that is slot 1, its clock freezes
   * where it stopped while slot 2 carries the debate on — so trusting slot 1 both freezes the
   * turn (audio never reaches the next speaker) and rewinds the pair on return, replaying
   * everything heard in the background.
   */
  it('reads the element still running when slot 1 is the one that stopped', () => {
    // Slot 1 frozen at 10 (debate 11) while slot 2 has reached 20 (debate 23).
    expect(pairPlayhead(video(true, 10), video(false, 20), offsets)).toEqual({ seconds: 23, live: true });
  });

  /**
   * THE SEQUENCE Copilot asked for: slot 1 stops, slot 2 plays on, slot 2 stops too. Now every
   * clock on the page is behind where the debate got to, and the caller's memory is the only
   * record of it. `ended` reads as paused, so it arrives here the same way.
   */
  it('prefers the remembered position once neither element is running', () => {
    expect(pairPlayhead(video(true, 10), video(true, 20), offsets, 23)).toEqual({ seconds: 23, live: false });
  });

  /**
   * The memory is refreshed on ticks, and `timeupdate` is throttled in a background tab — so an
   * element that stops between ticks stops somewhere the memory never saw. Its own `pause` event
   * arrives too late to help: by then it already reads as paused. Slot 2's frozen clock is the
   * only record of those last seconds.
   */
  it('weighs slot 2 frozen clock when it stopped past the last tick observed', () => {
    // Memory says 23 (the last tick), but slot 2 actually ran on to 30 (debate 33).
    expect(pairPlayhead(video(true, 10), video(true, 30), offsets, 23)).toEqual({ seconds: 33, live: false });
  });

  /**
   * ...but only once slot 2 has actually played. A recording that starts after the debate window
   * has a positive offset, so an untouched slot 2 would otherwise read as being that far in.
   */
  it('ignores a slot 2 that has never played, offset and all', () => {
    expect(pairPlayhead(video(true, 0), video(true, 0), offsets)).toEqual({ seconds: 1, live: false });
  });

  /** Never backwards: a memory behind the frozen clock is the stale one. */
  it('keeps the frozen clock when it is ahead of the remembered position', () => {
    expect(pairPlayhead(video(true, 40), video(true, 5), offsets, 12)).toEqual({ seconds: 41, live: false });
  });

  /** A running element always wins over the memory — that is what keeps a scrub honest. */
  it('ignores the remembered position while something is running', () => {
    expect(pairPlayhead(video(false, 5), video(true, 20), offsets, 90)).toEqual({ seconds: 6, live: true });
  });

  it('survives an element that is not mounted yet', () => {
    expect(pairPlayhead(null, null, offsets)).toEqual({ seconds: 1, live: false });
    expect(pairPlayhead(null, video(false, 20), offsets)).toEqual({ seconds: 23, live: true });
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

  /**
   * A video whose `play()` resolves but leaves `paused` true for a moment, which is what a real
   * element does while it transitions. This is the shape that produced the false "Could not play
   * both videos" on every scroll: the old check read `paused` on the next microtask and called it
   * a block.
   */
  function laggyVideo({ pollsUntilPlaying }: { pollsUntilPlaying: number }) {
    const video = {
      muted: true,
      paused: true,
      plays: 0,
      polls: 0,
      async play() {
        this.plays += 1;
      },
      /** Flips to playing only after the helper has waited `pollsUntilPlaying` times. */
      tick() {
        this.polls += 1;
        if (this.polls >= pollsUntilPlaying) this.paused = false;
      },
    };
    return video;
  }

  it('does not report a block when the element is only slow to leave paused (GEO-2783 follow-up)', async () => {
    const a = laggyVideo({ pollsUntilPlaying: 2 });
    const b = laggyVideo({ pollsUntilPlaying: 2 });
    const wait = async () => {
      a.tick();
      b.tick();
    };

    expect(await playBothWithMutedFallback(a, b, wait)).toBe('playing');
    // The point of the fix: no muted retry, because it was never actually blocked.
    expect([a.plays, b.plays]).toEqual([1, 1]);
  });

  it('still reports a block when the element never starts', async () => {
    const a = laggyVideo({ pollsUntilPlaying: Number.POSITIVE_INFINITY });
    const b = laggyVideo({ pollsUntilPlaying: Number.POSITIVE_INFINITY });
    const wait = async () => {
      a.tick();
      b.tick();
    };

    // Both already muted, so there is no fallback to try — this must not be reported as playing.
    expect(await playBothWithMutedFallback(a, b, wait)).toBe('blocked');
  });

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

  /**
   * A mute left behind by a failed retry is invisible to React — it only writes a DOM property
   * when its own previous value differs — so it survives every later render that says otherwise,
   * leaving the pair silently muted under a UI still offering a "mute" control (GEO-2947).
   */
  it('leaves the pair muted when it gives up, for the renderer to repair', async () => {
    // Refuses to start either way, so the muted retry fails too and the helper gives up.
    const stuck = () => {
      const video = fakeVideo({ muted: false });
      video.play = async () => {
        video.plays += 1;
      };
      return video;
    };
    const a = stuck();
    const b = stuck();

    expect(await playBothWithMutedFallback(a, b)).toBe('blocked');

    // Deliberately not restored. Anything captured on the way in is up to ~300ms stale by now —
    // the viewer can mute mid-attempt — and React never repairs a DOM write it did not make, so
    // a stale `false` written back here would play audibly under a UI showing muted (GEO-2947).
    expect(a.muted).toBe(true);
    expect(b.muted).toBe(true);
  });

  /** ...but a retry that *worked* keeps the mute: the caller records it as the rendered truth. */
  it('keeps the mute when the muted retry succeeds', async () => {
    const a = fakeVideo({ muted: false, blockUnmuted: true });
    const b = fakeVideo({ muted: false, blockUnmuted: true });

    expect(await playBothWithMutedFallback(a, b)).toBe('playing-muted');

    expect(a.muted).toBe(true);
    expect(b.muted).toBe(true);
  });

  it('keeps sound when the play is gesture-driven', async () => {
    const a = fakeVideo({ muted: false, blockUnmuted: false });
    const b = fakeVideo({ muted: false, blockUnmuted: false });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing');
    expect(a.muted).toBe(false);
  });
});
