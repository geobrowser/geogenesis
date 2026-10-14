import { describe, expect, it } from 'vitest';

import type {
  Debate,
  DebateMediaCondensedBreak,
  DebateMediaEarlyEndGap,
  DebateMediaRoundPick,
  DebateMediaTurnSegment,
} from './api';
import {
  BREAK_FLIP_SHARE,
  EARLY_END_HOLD_MS,
  breakAnnouncesRound,
  breakCueAt,
  breaksEndMs,
  earlyEndCueAt,
  finalPicks,
  inUncondensedLeadIn,
} from './playback-breaks';

// The Preston vs Adam debate (01a1369d…) as geo-chat's condensed render published it (GEO-3276).
const BREAKS: DebateMediaCondensedBreak[] = [
  {
    kind: 'lead_in',
    round_index: 0,
    next_round_index: 1,
    output_start_ms: 120_000,
    output_end_ms: 121_600,
    duration_ms: 1_600,
    source_start_ms: 120_000,
    source_end_ms: 128_000,
    speed: 5,
  },
  {
    kind: 'extend',
    round_index: 1,
    next_round_index: 2,
    output_start_ms: 211_600,
    output_end_ms: 214_000,
    duration_ms: 2_400,
    source_start_ms: 221_950,
    source_end_ms: 229_950,
    speed: 3.33,
  },
  {
    kind: 'final_end',
    round_index: 2,
    output_start_ms: 301_430,
    output_end_ms: 303_430,
    duration_ms: 2_000,
    source_start_ms: 320_000,
    source_end_ms: 323_000,
    speed: 1.5,
  },
];

const pick = (
  round: number,
  slot: 1 | 2,
  value: 'extend' | 'end',
  at: string,
  previous: 'extend' | 'end' | null = null
): DebateMediaRoundPick => ({
  round_index: round,
  participant_slot: slot,
  pick: value,
  previous_pick: previous,
  turn_index: round * 2 + 1,
  during_decision: true,
  at,
  output_ms: 0,
});

const PICKS: DebateMediaRoundPick[] = [
  pick(1, 1, 'extend', '2026-10-13T18:59:45.101Z'),
  pick(1, 2, 'extend', '2026-10-13T18:59:47.680Z'),
  // Adam never picked in round 2 (index); Preston changed his mind once.
  pick(2, 1, 'end', '2026-10-13T19:01:20.000Z'),
  pick(2, 1, 'extend', '2026-10-13T19:01:28.000Z', 'end'),
];

describe('breakCueAt', () => {
  it('is nothing outside a break', () => {
    expect(breakCueAt(BREAKS, PICKS, 119_999)).toBeNull();
    expect(breakCueAt(BREAKS, PICKS, 121_600)).toBeNull();
    expect(breakCueAt([], PICKS, 120_500)).toBeNull();
  });

  it('announces a required round at once, with no picks, since nobody picked', () => {
    expect(breakCueAt(BREAKS, PICKS, 120_400)).toEqual({
      kind: 'lead_in',
      elapsedMs: 400,
      durationMs: 1_600,
      resultStartMs: 0,
      picks: null,
      nextRoundIndex: 1,
    });
  });

  it('turns the picks for the first third of an Extend, then the next round takes over', () => {
    const cue = breakCueAt(BREAKS, PICKS, 212_000);
    expect(cue).toMatchObject({
      kind: 'extend',
      elapsedMs: 400,
      picks: { 1: 'extend', 2: 'extend' },
      nextRoundIndex: 2,
    });
    expect(cue?.resultStartMs).toBe(Math.round(2_400 * BREAK_FLIP_SHARE));
  });

  it('reveals the final round with a missing pick as no pick, and leads nowhere', () => {
    expect(breakCueAt(BREAKS, PICKS, 302_000)).toMatchObject({
      kind: 'final_end',
      picks: { 1: 'extend', 2: null },
      nextRoundIndex: null,
    });
  });
});

describe('finalPicks', () => {
  it('takes the last pick each debater saved, and none for a debater who never picked', () => {
    expect(finalPicks(PICKS, 2)).toEqual({ 1: 'extend', 2: null });
    expect(finalPicks(PICKS, 1)).toEqual({ 1: 'extend', 2: 'extend' });
  });

  it('does not depend on the order the picks arrive in', () => {
    expect(finalPicks([...PICKS].reverse(), 2)).toEqual({ 1: 'extend', 2: null });
  });
});

describe('breakAnnouncesRound', () => {
  it('is the rounds a break leads into, and never the opening', () => {
    expect(breakAnnouncesRound(BREAKS, 1)).toBe(true);
    expect(breakAnnouncesRound(BREAKS, 2)).toBe(true);
    expect(breakAnnouncesRound(BREAKS, 0)).toBe(false);
    expect(breakAnnouncesRound([], 1)).toBe(false);
  });
});

describe('earlyEndCueAt', () => {
  // Preston ended round 3's first turn early; the render cut it to 0.6 s of quiet at 254.994 s.
  const gaps: DebateMediaEarlyEndGap[] = [
    {
      turn_index: 4,
      next_turn_index: 5,
      output_ms: 254_994,
      source_start_ms: 270_944,
      source_end_ms: 274_650,
      removed_ms: 3_706,
      quiet_kept_ms: 300,
    },
  ];
  const segments: DebateMediaTurnSegment[] = [
    { turn_index: 4, participant_slot: 1, output_start_ms: 214_000, output_end_ms: 254_994, duration_ms: 40_994 },
    { turn_index: 5, participant_slot: 2, output_start_ms: 254_994, output_end_ms: 299_994, duration_ms: 45_000 },
  ];

  it('covers the kept quiet before the cut and a short hold after it', () => {
    expect(earlyEndCueAt(gaps, segments, 254_694)).toEqual({ endedSlot: 1, nextSlot: 2 });
    expect(earlyEndCueAt(gaps, segments, 254_994 + EARLY_END_HOLD_MS - 1)).toEqual({ endedSlot: 1, nextSlot: 2 });
    expect(earlyEndCueAt(gaps, segments, 254_693)).toBeNull();
    expect(earlyEndCueAt(gaps, segments, 254_994 + EARLY_END_HOLD_MS)).toBeNull();
  });

  it('draws nothing when it cannot tell who spoke', () => {
    expect(earlyEndCueAt(gaps, [], 254_994)).toBeNull();
  });
});

describe('inUncondensedLeadIn', () => {
  const openRounds = (leadInMs: number) =>
    ({ open_rounds: { required_rebuttal_rounds: 1, required_round_lead_in_ms: leadInMs } }) as unknown as Debate;
  // Before GEO-3276 the 8 s lead-in sits at the front of round 2's first turn, before its countdown.
  const kept: DebateMediaTurnSegment[] = [
    {
      turn_index: 2,
      participant_slot: 1,
      output_start_ms: 120_000,
      output_end_ms: 173_000,
      duration_ms: 53_000,
      countdown_start_ms: 128_000,
    },
  ];

  it('is the stretch of a required round’s first turn before its countdown', () => {
    expect(inUncondensedLeadIn(openRounds(8_000), kept, 120_000)).toBe(true);
    expect(inUncondensedLeadIn(openRounds(8_000), kept, 127_999)).toBe(true);
    expect(inUncondensedLeadIn(openRounds(8_000), kept, 128_000)).toBe(false);
  });

  it('never applies to a condensed render, a debate with no lead-in, or a fixed format', () => {
    const condensed = [{ ...kept[0], output_start_ms: 121_600, countdown_start_ms: 121_600 }];
    expect(inUncondensedLeadIn(openRounds(8_000), condensed, 121_600)).toBe(false);
    expect(inUncondensedLeadIn(openRounds(0), kept, 124_000)).toBe(false);
    expect(inUncondensedLeadIn({} as Debate, kept, 124_000)).toBe(false);
  });

  it('leaves an early end’s hand-off alone: that is the next speaker’s own turn', () => {
    const handOff = [{ ...kept[0], turn_index: 5, participant_slot: 2 as const }];
    expect(inUncondensedLeadIn(openRounds(8_000), handOff, 124_000)).toBe(false);
  });
});

describe('breaksEndMs', () => {
  it('is where the final End’s reveal ends, after the last turn', () => {
    expect(breaksEndMs(BREAKS)).toBe(303_430);
    expect(breaksEndMs([])).toBe(0);
  });
});
