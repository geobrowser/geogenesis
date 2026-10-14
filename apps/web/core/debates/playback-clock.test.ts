import { describe, expect, it } from 'vitest';

import { RENDERED_MEDIA, RENDERED_SOURCE_TURNS, RENDERED_TURN_SEGMENTS } from './open-rounds-media-fixtures';
import { identityClock, playbackClockFrom, toPlaybackClock } from './playback-clock';

describe('playbackClockFrom', () => {
  const clock = playbackClockFrom(RENDERED_MEDIA);

  // The render's own record of where every turn sits in the raw recordings. Rebuilding it from the
  // breaks and early ends alone has to land on it exactly, or the player switches turns early.
  it('puts every turn where the render says it is in the raw recordings', () => {
    for (const [turnIndex, sourceStart, sourceEnd] of RENDERED_SOURCE_TURNS) {
      const segment = RENDERED_TURN_SEGMENTS.find(entry => entry.turn_index === turnIndex)!;
      expect([turnIndex, clock(segment.output_start_ms, 'start'), clock(segment.output_end_ms, 'end')]).toEqual([
        turnIndex,
        sourceStart,
        sourceEnd,
      ]);
    }
  });

  it('keeps a turn that ends where a break begins before it, and the turn after it after', () => {
    // Adam's round 2 turn ends at 211.6 s rendered; the cut pick window follows it in the recordings.
    expect(clock(211_600, 'end')).toBe(218_000);
    expect(clock(211_600, 'start')).toBe(221_950);
    // The early end: the cut is a point in the render and 3.7 s in the recordings.
    expect(clock(254_994, 'end')).toBe(270_944);
    expect(clock(254_994, 'start')).toBe(274_650);
  });

  it('runs a condensed break at its source speed', () => {
    // Halfway through the 1.6 s lead-in is halfway through the 8 s it condensed.
    expect(clock(120_800)).toBe(124_000);
  });

  it('is the identity with no edits, as for every fixed format', () => {
    expect(playbackClockFrom(undefined)).toBe(identityClock);
    expect(playbackClockFrom({ condensed_breaks: [], early_end_gaps: [], round_results: [] })).toBe(identityClock);
  });

  it('places an older render by its kept Extend reveals alone', () => {
    // Before condensing: the pick window cut, the reveal kept at real length.
    const older = playbackClockFrom({ round_results: [RENDERED_MEDIA.round_results![0]] });
    expect(older(211_600, 'end')).toBe(211_600);
    expect(older(211_600, 'start')).toBe(221_950);
    expect(older(214_000, 'start')).toBe(229_950);
  });
});

describe('toPlaybackClock', () => {
  it('moves a segment and its countdown onto the recordings, keeping its own length', () => {
    const clock = playbackClockFrom(RENDERED_MEDIA);
    expect(toPlaybackClock(RENDERED_TURN_SEGMENTS[5], clock)).toMatchObject({
      output_start_ms: 274_650,
      output_end_ms: 321_086,
      duration_ms: 46_436,
      countdown_start_ms: 274_950,
    });
  });

  it('leaves a segment alone on the identity clock', () => {
    expect(toPlaybackClock(RENDERED_TURN_SEGMENTS[2], identityClock)).toBe(RENDERED_TURN_SEGMENTS[2]);
  });
});
