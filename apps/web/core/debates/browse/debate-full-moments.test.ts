import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment } from '~/core/debates/api';
import type { DebateMoment } from '~/core/debates/moments-player/debate-moments';
import { playbackTimeline } from '~/core/debates/playback-timeline';

import { SKIP_END_MARGIN_MS, momentDotsOnRecordings, skipTargetSeconds } from './debate-full-moments';

/**
 * An edited Open rounds render (GEO-3293): turn 0 kept whole, then a 40 s break condensed to 10 s
 * on the rendered clock, then turn 1. So from turn 1 on, the recordings run 30 s ahead of the render.
 */
const OPEN_ROUNDS_TURNS: DebateMediaTurnSegment[] = [
  {
    turn_index: 0,
    participant_slot: 1,
    output_start_ms: 0,
    output_end_ms: 60_000,
    duration_ms: 60_000,
    source_start_ms: 0,
    source_end_ms: 60_000,
  },
  {
    turn_index: 1,
    participant_slot: 2,
    output_start_ms: 70_000,
    output_end_ms: 130_000,
    duration_ms: 60_000,
    source_start_ms: 100_000,
    source_end_ms: 160_000,
  },
];

const moment = (overrides: Partial<DebateMoment>): DebateMoment => ({
  id: 'clip-1',
  momentIndex: 0,
  claimIndex: 0,
  claimText: null,
  participantSlot: 2,
  clipUrl: 'https://chat.test/clip-1',
  durationMs: 12_000,
  debateStartMs: null,
  debateEndMs: null,
  cutStartMs: null,
  cutEndMs: null,
  captions: [],
  ...overrides,
});

describe('momentDotsOnRecordings', () => {
  it("places a moment at its words, not its clip's lead-in that falls in a condensed break", () => {
    // The words start 500 ms into turn 1; the clip was cut 1.5 s earlier, inside the condensed
    // break, which no turn covers. Mapped from the cut, the dot would land 30 s early, in turn 0.
    const dots = momentDotsOnRecordings(
      [moment({ debateStartMs: 70_500, debateEndMs: 80_000, cutStartMs: 69_000, cutEndMs: 80_250 })],
      OPEN_ROUNDS_TURNS
    );
    expect(dots).toEqual([{ id: 'clip-1', atMs: 100_500 }]);
  });

  it('keeps the rendered time on a debate whose clocks agree', () => {
    const fixedFormat = OPEN_ROUNDS_TURNS.map(({ source_start_ms: _s, source_end_ms: _e, ...turn }) => turn);
    expect(momentDotsOnRecordings([moment({ debateStartMs: 70_500 })], fixedFormat)).toEqual([
      { id: 'clip-1', atMs: 70_500 },
    ]);
    expect(momentDotsOnRecordings([moment({ debateStartMs: 4_000 })], undefined)).toEqual([
      { id: 'clip-1', atMs: 4_000 },
    ]);
  });

  it('leaves out a moment with no place in the debate, and puts the rest in time order', () => {
    const dots = momentDotsOnRecordings(
      [
        moment({ id: 'late', momentIndex: 0, debateStartMs: 120_000 }),
        moment({ id: 'unplaced', momentIndex: 1, debateStartMs: null }),
        moment({ id: 'early', momentIndex: 2, debateStartMs: 10_000 }),
      ],
      OPEN_ROUNDS_TURNS
    );
    expect(dots.map(dot => dot.id)).toEqual(['early', 'late']);
    expect(dots[1].atMs).toBe(150_000);
  });

  it('draws nothing for a debate with no reel', () => {
    expect(momentDotsOnRecordings([], OPEN_ROUNDS_TURNS)).toEqual([]);
  });
});

describe('skipTargetSeconds', () => {
  const plain = playbackTimeline([], 120_000);

  it('moves ten seconds either way', () => {
    expect(skipTargetSeconds(plain, 30, 10)).toBe(40);
    expect(skipTargetSeconds(plain, 30, -10)).toBe(20);
  });

  it('never goes before the start', () => {
    expect(skipTargetSeconds(plain, 4, -10)).toBe(0);
  });

  it('stops short of the last frame, so a skip near the end does not end the debate', () => {
    expect(skipTargetSeconds(plain, 115, 10)).toBe((120_000 - SKIP_END_MARGIN_MS) / 1000);
    expect(skipTargetSeconds(plain, 119.99, 10)).toBe((120_000 - SKIP_END_MARGIN_MS) / 1000);
  });

  it("counts ten seconds of what plays, across a break the player cuts", () => {
    // 40–70 s on the recordings is cut in playback: 35 s + 10 s of play lands at 75 s, not 45 s.
    const cut = playbackTimeline([{ atMs: 40_000, toMs: 70_000 }], 120_000);
    expect(skipTargetSeconds(cut, 35, 10)).toBe(75);
    expect(skipTargetSeconds(cut, 75, -10)).toBe(35);
  });
});
