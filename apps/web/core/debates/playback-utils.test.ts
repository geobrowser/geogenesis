import { describe, expect, it } from 'vitest';

import type { DebateMediaArtifactKind, DebateMediaResponse, DebateMediaTurnSegment } from './api';
import {
  clampSeconds,
  hasProcessedVideo,
  normalizeTurnDurationsMs,
  pairPlayhead,
  playBothWithMutedFallback,
  recordingWindowOffsetsSeconds,
  sortTurnSegments,
  timelineSecondsFor,
  timelineSecondsForSegments,
  turnStateForTime,
  turnStateFromSegments,
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

describe('turnStateFromSegments (GEO-2949)', () => {
  // The shape 01a0b054c50f7540b35192ca5a1737d1 actually rendered: a [60s, 60s] allowance where
  // the first speaker yielded at 50.829s, so the incoming speaker's video starts there while
  // their own clock only starts after the 5s handoff.
  const segments: DebateMediaTurnSegment[] = [
    {
      turn_index: 0,
      participant_slot: 1,
      output_start_ms: 0,
      output_end_ms: 50_829,
      duration_ms: 50_829,
      countdown_start_ms: 0,
    },
    {
      turn_index: 1,
      participant_slot: 2,
      output_start_ms: 50_829,
      output_end_ms: 115_976,
      duration_ms: 65_147,
      countdown_start_ms: 55_976,
    },
  ];

  it('switches speaker where the render cut, not where the allowance did', () => {
    // The whole bug in one assertion: the allowance says slot 1 holds the floor until 60s.
    expect(turnStateForTime(1, [60_000, 60_000], 55)?.slot).toBe(1);
    expect(turnStateFromSegments(segments, 55)?.slot).toBe(2);
  });

  it('reports time remaining against the rendered turn end', () => {
    expect(turnStateFromSegments(segments, 40)?.seconds).toBeCloseTo(10.829, 3);
  });

  it('holds the ring at zero through the handoff, then runs the speaker own clock', () => {
    // 50.829s-55.976s is the handoff: slot 2 is talking and audible, but their timer has not
    // started, so the ring must not have advanced.
    expect(turnStateFromSegments(segments, 53)?.progress).toBe(0);
    // Half of the 60s clock, which lands at 85.976s — not at the midpoint of the 65.1s window.
    expect(turnStateFromSegments(segments, 85.976)?.progress).toBeCloseTo(0.5, 3);
    expect(turnStateFromSegments(segments, 115.9)?.progress).toBeCloseTo(1, 1);
  });

  it('falls back to the segment start when the API sends no countdown start', () => {
    const [first] = segments;
    const withoutCountdown: DebateMediaTurnSegment[] = [{ ...first, countdown_start_ms: undefined }];
    expect(turnStateFromSegments(withoutCountdown, 25.4145)?.progress).toBeCloseTo(0.5, 3);
  });

  it('holds the final speaker past the end rather than blanking them', () => {
    // The playhead rests on output_end_ms for the whole paused tail after playback finishes.
    expect(turnStateFromSegments(segments, 115.976)?.slot).toBe(2);
    expect(turnStateFromSegments(segments, 300)?.slot).toBe(2);
  });

  it('has no opinion when the render produced no segments', () => {
    expect(turnStateFromSegments([], 12)).toBeNull();
  });
});

describe('sortTurnSegments', () => {
  it('orders by output start so a binary-search-free lookup cannot pick the wrong speaker', () => {
    const out = sortTurnSegments([
      { turn_index: 1, participant_slot: 2, output_start_ms: 50_829, output_end_ms: 115_976, duration_ms: 65_147 },
      { turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 50_829, duration_ms: 50_829 },
    ]);
    expect(out.map(segment => segment.turn_index)).toEqual([0, 1]);
  });

  it('drops empty and malformed segments', () => {
    const out = sortTurnSegments([
      { turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 0, duration_ms: 0 },
      { turn_index: 1, participant_slot: 2, output_start_ms: Number.NaN, output_end_ms: 10, duration_ms: 10 },
    ]);
    expect(out).toEqual([]);
  });
});

describe('timelineSecondsForSegments', () => {
  it('ends where the video ends, not where the allowance would', () => {
    // 270s of allowance, 264.412s of rendered video: the difference is what left the scrubber
    // running past the end of both recordings.
    expect(timelineSecondsFor([60_000, 60_000, 45_000, 45_000, 30_000, 30_000])).toBe(270);
    expect(
      timelineSecondsForSegments([
        { turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 50_829, duration_ms: 50_829 },
        { turn_index: 5, participant_slot: 2, output_start_ms: 232_049, output_end_ms: 264_412, duration_ms: 32_363 },
      ])
    ).toBeCloseTo(264.412, 3);
  });

  it('is zero without segments, so the caller keeps the allowance', () => {
    expect(timelineSecondsForSegments([])).toBe(0);
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
   * In the foreground slot 1 is canonical, full stop. Slot 2 is *deliberately* allowed to run
   * ahead — the drift nudge puts it there, and a stalled slot 1 leaves it much further ahead
   * (GEO-2828) — so an ordinary pause or a scroll-away must not resume from it, or playback skips
   * audio the viewer never heard.
   */
  describe('without trustSecondary (the foreground)', () => {
    it('ignores a slot 2 that has run ahead of a paused slot 1', () => {
      expect(pairPlayhead(video(true, 10), video(true, 30), offsets)).toEqual({ seconds: 11, live: false });
    });

    it('ignores a running slot 2 while slot 1 is paused', () => {
      expect(pairPlayhead(video(true, 10), video(false, 30), offsets)).toEqual({ seconds: 11, live: false });
    });

    it('still lets the remembered position raise a frozen slot 1', () => {
      expect(pairPlayhead(video(true, 10), video(true, 30), offsets, 20)).toEqual({ seconds: 20, live: false });
    });
  });

  /**
   * Off screen the picture inverts: the browser stops whichever element it considers silent, so
   * slot 1's clock can be frozen at an arbitrary past instant while slot 2 carries the debate on.
   */
  describe('with trustSecondary (a backgrounded tab)', () => {
    it('reads the element still running when slot 1 is the one that stopped', () => {
      // Slot 1 frozen at 10 (debate 11) while slot 2 has reached 20 (debate 23).
      expect(pairPlayhead(video(true, 10), video(false, 20), offsets, null, true)).toEqual({
        seconds: 23,
        live: true,
      });
    });

    /**
     * The sequence with no tick in between: slot 1 stops, slot 2 plays on, slot 2 stops too.
     * `timeupdate` is throttled in a background tab, so slot 2 stops somewhere the record never
     * saw, and its own `pause` arrives when it already reads as paused. Its frozen clock is the
     * only evidence left.
     */
    it('weighs slot 2 frozen clock when it stopped past the last position recorded', () => {
      expect(pairPlayhead(video(true, 10), video(true, 30), offsets, 23, true)).toEqual({
        seconds: 33,
        live: false,
      });
    });

    /**
     * ...but only once slot 2 has actually played. A recording that starts after the debate
     * window has a positive offset, so an untouched slot 2 would otherwise read as being that far
     * into the debate.
     */
    it('ignores a slot 2 that has never played, offset and all', () => {
      expect(pairPlayhead(video(true, 0), video(true, 0), offsets, null, true)).toEqual({
        seconds: 1,
        live: false,
      });
    });

    it('keeps the frozen clock when it is ahead of the remembered position', () => {
      expect(pairPlayhead(video(true, 40), video(true, 5), offsets, 12, true)).toEqual({
        seconds: 41,
        live: false,
      });
    });
  });

  /** A running slot 1 always wins over the record — that is what keeps a scrub honest. */
  it('ignores the remembered position while slot 1 is running', () => {
    expect(pairPlayhead(video(false, 5), video(true, 20), offsets, 90, true)).toEqual({ seconds: 6, live: true });
  });

  it('survives an element that is not mounted yet', () => {
    expect(pairPlayhead(null, null, offsets)).toEqual({ seconds: 1, live: false });
    expect(pairPlayhead(null, video(false, 20), offsets, null, true)).toEqual({ seconds: 23, live: true });
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

    expect(await playBothWithMutedFallback(a, b, { wait })).toBe('playing');
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
    expect(await playBothWithMutedFallback(a, b, { wait })).toBe('blocked');
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

  /**
   * The retry is the only point where this function starts something it did not start, and it is
   * reached after a confirm window it spent asleep — so a pause or a scroll-away routinely lands
   * in between. A caller that checks ownership only once this returns is too late: `play()` has
   * already been called, and no state check can take it back.
   */
  it('does not retry when the attempt was cancelled while confirming', async () => {
    const a = fakeVideo({ muted: false });
    const b = fakeVideo({ muted: false });

    expect(await playBothWithMutedFallback(a, b, { isCancelled: () => true })).toBe('cancelled');

    expect(a.plays).toBe(1); // the first attempt only — no restart behind the viewer's pause
    expect(b.plays).toBe(1);
    expect(a.paused).toBe(true);
    expect(b.paused).toBe(true);
    expect(a.muted).toBe(false); // and nothing was force-muted for a retry that never ran
  });

  /** The control: an attempt nobody superseded still retries muted and reports it. */
  it('still retries when nothing cancelled it', async () => {
    const a = fakeVideo({ muted: false });
    const b = fakeVideo({ muted: false });

    expect(await playBothWithMutedFallback(a, b, { isCancelled: () => false })).toBe('playing-muted');

    expect(a.plays).toBe(2);
    expect(a.muted).toBe(true);
  });

  it('keeps sound when the play is gesture-driven', async () => {
    const a = fakeVideo({ muted: false, blockUnmuted: false });
    const b = fakeVideo({ muted: false, blockUnmuted: false });
    expect(await playBothWithMutedFallback(a, b)).toBe('playing');
    expect(a.muted).toBe(false);
  });
});
