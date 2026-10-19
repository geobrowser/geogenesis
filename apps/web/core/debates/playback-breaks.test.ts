import { describe, expect, it } from 'vitest';

import type { Debate, DebateMediaTurnSegment } from './api';
import { RENDERED_MEDIA } from './open-rounds-media-fixtures';
import {
  BREAK_PLAYED_MS,
  EARLY_END_HOLD_MS,
  NO_PLAYBACK_BREAKS,
  breakAnnouncesRound,
  breakCueAt,
  breakCuts,
  breakFirstName,
  breaksEndMs,
  earlyEndCueAt,
  finalPicks,
  playbackBreaksFrom,
  silentAt,
} from './playback-breaks';
import { turnOnRecordings } from './recording-clock';

const openRounds = (leadInMs = 8_000) =>
  ({
    open_rounds: { required_rebuttal_rounds: 1, required_round_lead_in_ms: leadInMs, result_window_ms: 3_000 },
  }) as unknown as Debate;

// The Preston vs Adam debate on the player's clock: the raw recordings, from the debate's start.
const segments = RENDERED_MEDIA.turn_segments!.map(turnOnRecordings);
const BREAKS = playbackBreaksFrom(openRounds(), RENDERED_MEDIA, segments);
const cueAt = (ms: number) => breakCueAt(BREAKS.breaks, BREAKS.picks, ms);

describe('playbackBreaksFrom', () => {
  it('finds nothing in a fixed-format debate, even from the same media', () => {
    expect(
      playbackBreaksFrom({ open_rounds: null } as unknown as Pick<Debate, 'open_rounds'>, RENDERED_MEDIA, segments)
    ).toBe(NO_PLAYBACK_BREAKS);
  });

  it('puts each break at its real length, with the pick window in front of it', () => {
    expect(BREAKS.breaks).toEqual([
      // The 8 s lead-in into Round 2: no pick window, nobody picked.
      { kind: 'lead_in', roundIndex: 0, nextRoundIndex: 1, decidingStartMs: 120_000, startMs: 120_000, endMs: 128_000 },
      // Round 2 ended at 218 s; they picked until 221.95 s; reveal and count-in to 229.95 s.
      { kind: 'extend', roundIndex: 1, nextRoundIndex: 2, decidingStartMs: 218_000, startMs: 221_950, endMs: 229_950 },
      // Round 3 ended at 321.1 s; 9.4 s of picking (Adam never did); the 3 s reveal closes it.
      {
        kind: 'final_end',
        roundIndex: 2,
        nextRoundIndex: null,
        decidingStartMs: 321_086,
        startMs: 330_481,
        endMs: 333_481,
      },
    ]);
    // Preston (slot 1) ended turn 4; Adam (slot 2) speaks next.
    expect(BREAKS.earlyEnds).toEqual([
      { turnIndex: 4, nextTurnIndex: 5, startMs: 270_944, endMs: 274_650, endedSlot: 1, nextSlot: 2 },
    ]);
  });

  it('finds an older render’s lead-in at the front of the round’s first turn, before its countdown', () => {
    const older: DebateMediaTurnSegment[] = [
      {
        turn_index: 2,
        participant_slot: 1,
        output_start_ms: 120_000,
        output_end_ms: 173_000,
        duration_ms: 53_000,
        countdown_start_ms: 128_000,
      },
    ];
    expect(playbackBreaksFrom(openRounds(), { round_results: [] }, older).breaks).toEqual([
      { kind: 'lead_in', roundIndex: 0, nextRoundIndex: 1, decidingStartMs: 120_000, startMs: 120_000, endMs: 128_000 },
    ]);
    expect(playbackBreaksFrom(openRounds(0), { round_results: [] }, older).breaks).toEqual([]);
  });

  it('is nothing for a fixed format or a debate with no media yet', () => {
    expect(playbackBreaksFrom({} as Debate, { round_results: [] }, []).breaks).toEqual([]);
    expect(playbackBreaksFrom(openRounds(), undefined, segments).breaks).toEqual([]);
  });
});

describe('breakCueAt', () => {
  it('is nothing inside a turn', () => {
    expect(cueAt(119_999)).toBeNull();
    expect(cueAt(128_000)).toBeNull();
    expect(cueAt(217_999)).toBeNull();
    expect(cueAt(333_481)).toBeNull();
  });

  // Round 2 (index 1) ended at 218 s; the player shows its next-round title for 2.4 s, then cuts.
  it('runs the title on the played stretch while retaining the saved picks as metadata', () => {
    expect(cueAt(218_500)).toEqual({
      kind: 'extend',
      elapsedMs: 500,
      playedMs: BREAK_PLAYED_MS.extend,
      picks: { 1: 'extend', 2: 'extend' },
      nextRoundIndex: 2,
    });
  });

  it('holds the end of the played stretch on a playhead past it, as a scrub or a pause leaves it', () => {
    expect(cueAt(226_000)).toMatchObject({ elapsedMs: BREAK_PLAYED_MS.extend });
  });

  it('has no picks for a required round’s lead-in, since nobody picked', () => {
    expect(cueAt(120_500)).toMatchObject({ kind: 'lead_in', elapsedMs: 500, picks: null, nextRoundIndex: 1 });
  });

  it('stamps a missing pick as no pick after the final round, and leads nowhere', () => {
    expect(cueAt(321_500)).toMatchObject({ kind: 'final_end', picks: { 1: 'extend', 2: null }, nextRoundIndex: null });
  });
});

describe('breakCuts', () => {
  it('cuts each break after its first couple of seconds, and an early end’s quiet at once', () => {
    expect(breakCuts(BREAKS)).toEqual([
      { atMs: 120_000 + BREAK_PLAYED_MS.lead_in, toMs: 128_000 },
      { atMs: 218_000 + BREAK_PLAYED_MS.extend, toMs: 229_950 },
      { atMs: 270_944, toMs: 274_650 },
      { atMs: 321_086 + BREAK_PLAYED_MS.final_end, toMs: 333_481 },
    ]);
  });

  it('leaves a break shorter than its share whole', () => {
    const short = { ...BREAKS, earlyEnds: [], breaks: [{ ...BREAKS.breaks[0], endMs: 121_000 }] };
    expect(breakCuts(short)).toEqual([]);
  });
});

describe('finalPicks', () => {
  it('takes the last pick each debater saved, and none for a debater who never picked', () => {
    expect(finalPicks(BREAKS.picks, 2)).toEqual({ 1: 'extend', 2: null });
    expect(finalPicks([...BREAKS.picks].reverse(), 2)).toEqual({ 1: 'extend', 2: null });
    expect(finalPicks(BREAKS.picks, 1)).toEqual({ 1: 'extend', 2: 'extend' });
  });
});

describe('breakAnnouncesRound', () => {
  it('is the rounds a break leads into, and never the opening', () => {
    expect(breakAnnouncesRound(BREAKS.breaks, 1)).toBe(true);
    expect(breakAnnouncesRound(BREAKS.breaks, 2)).toBe(true);
    expect(breakAnnouncesRound(BREAKS.breaks, 0)).toBe(false);
  });
});

describe('earlyEndCueAt', () => {
  it('covers the quiet between Preston’s last word and Adam’s first, and a moment past it', () => {
    expect(earlyEndCueAt(BREAKS.earlyEnds, 270_944)).toEqual({
      endedSlot: 1,
      nextSlot: 2,
      ageMs: 0,
      durationMs: 4_406,
    });
    expect(earlyEndCueAt(BREAKS.earlyEnds, 274_650 + EARLY_END_HOLD_MS - 1)).toEqual({
      endedSlot: 1,
      nextSlot: 2,
      ageMs: 4_405,
      durationMs: 4_406,
    });
    expect(earlyEndCueAt(BREAKS.earlyEnds, 270_943)).toBeNull();
    expect(earlyEndCueAt(BREAKS.earlyEnds, 274_650 + EARLY_END_HOLD_MS)).toBeNull();
    // An early end whose turns the media lacks has no one to name.
    expect(earlyEndCueAt([{ ...BREAKS.earlyEnds[0], endedSlot: null }], 272_000)).toBeNull();
  });
});

describe('silentAt', () => {
  it('is every stretch nobody holds a turn, and none of the turns', () => {
    for (const ms of [120_000, 127_999, 218_000, 225_000, 272_000, 321_086, 333_000])
      expect(silentAt(BREAKS, ms)).toBe(true);
    for (const ms of [119_999, 128_000, 217_999, 229_950, 270_943, 274_650, 321_085])
      expect(silentAt(BREAKS, ms)).toBe(false);
  });
});

describe('breaksEndMs', () => {
  it('is where the final End’s reveal ends, after the last turn', () => {
    expect(breaksEndMs(BREAKS.breaks)).toBe(333_481);
    expect(breaksEndMs([])).toBe(0);
  });
});

describe('breakFirstName', () => {
  it('is the first name, so the banner keeps to one line', () => {
    expect(breakFirstName({ display_name: 'Preston Mantel' })).toBe('Preston');
    expect(breakFirstName({ display_name: '  Adam   Fischer ' })).toBe('Adam');
    expect(breakFirstName({ display_name: null })).toBe('Debater');
    expect(breakFirstName(null)).toBe('Debater');
  });
});
