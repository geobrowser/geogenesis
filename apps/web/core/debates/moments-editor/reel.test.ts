import { describe, expect, it } from 'vitest';

import type { DebateTranscriptSpan } from '../api';
import { RENDERED_TURN_SEGMENTS } from '../open-rounds-media-fixtures';
import {
  type EditorClip,
  type ReelWord,
  clipProblems,
  clipQuote,
  clipSpeaker,
  clipsFromLiveReel,
  clipsFromServedMoments,
  edgeIsFree,
  formatReelTime,
  manualReel,
  manualReelClips,
  parseReelTime,
  playerWords,
  realSpeedStretches,
  reelProblems,
  snapEdge,
  stepEdge,
} from './reel';

const word = (slot: 1 | 2, start: number, end: number, text = 'w'): ReelWord => ({
  slot,
  start_ms: start,
  end_ms: end,
  text,
});

const ONE_CLOCK = RENDERED_TURN_SEGMENTS.map(({ source_start_ms: _s, source_end_ms: _e, ...rest }) => rest);

const clip = (start: number, end: number, claim: number | null = null): EditorClip => ({
  key: `${start}`,
  start_ms: start,
  end_ms: end,
  claim_index: claim,
  live_claim_text: null,
});

describe('playerWords', () => {
  const served = (start: number, end: number, source?: [number, number]): DebateTranscriptSpan => ({
    participant_slot: 1,
    start_ms: start,
    end_ms: end,
    ...(source && { source_start_ms: source[0], source_end_ms: source[1] }),
    text: `${start}`,
  });

  it('puts each word on the player’s clock and drops one the render cut', () => {
    const words = playerWords([served(130_000, 130_400, [136_400, 136_800]), served(120_500, 120_900)]);
    expect(words.map(w => [w.start_ms, w.end_ms])).toEqual([[136_400, 136_800]]);
  });

  it('keeps a fixed format’s words where they are, in time order', () => {
    expect(playerWords([served(2_000, 2_400), served(1_000, 1_400)]).map(w => w.start_ms)).toEqual([1_000, 2_000]);
  });
});

describe('clipSpeaker (as geo-chat’s manual_moments decides it)', () => {
  it('is the debater who says most of the words wholly inside the clip', () => {
    const words = [word(1, 0, 400), word(2, 500, 900), word(2, 1_000, 1_400)];
    expect(clipSpeaker(words, 0, 1_500)).toBe(2);
  });

  it('counts only words wholly inside, not ones crossing an edge', () => {
    // Slot 2's two words both cross the edges; slot 1's one word is inside.
    const words = [word(2, 0, 400), word(1, 500, 900), word(2, 1_000, 1_400)];
    expect(clipSpeaker(words, 200, 1_200)).toBe(1);
  });

  it('gives a tie to the lower slot', () => {
    const words = [word(2, 0, 400), word(1, 500, 900)];
    expect(clipSpeaker(words, 0, 1_000)).toBe(1);
    expect(clipSpeaker([word(1, 500, 900), word(2, 0, 400)], 0, 1_000)).toBe(1);
  });

  it('is nobody when no whole word is said', () => {
    expect(clipSpeaker([word(1, 0, 400)], 100, 300)).toBeNull();
  });
});

describe('snapEdge', () => {
  const words = [word(1, 1_000, 1_400, 'Coffee'), word(1, 1_500, 1_900, 'dates')];

  it('takes the whole word an edge falls in: a start to its start, an end to its end', () => {
    expect(snapEdge(1_200, words, 'start')).toBe(1_000);
    expect(snapEdge(1_700, words, 'end')).toBe(1_900);
  });

  it('leaves an edge in silence, or on a boundary, where it is', () => {
    expect(snapEdge(1_450, words, 'start')).toBe(1_450);
    expect(snapEdge(1_400, words, 'end')).toBe(1_400);
  });
});

describe('stepEdge', () => {
  const words = [word(1, 1_000, 1_400), word(1, 1_500, 1_900), word(1, 2_000, 2_400)];

  it('steps a start between word starts and an end between word ends', () => {
    expect(stepEdge(1_000, words, 'start', 1)).toBe(1_500);
    expect(stepEdge(1_500, words, 'start', -1)).toBe(1_000);
    expect(stepEdge(1_400, words, 'end', 1)).toBe(1_900);
    expect(stepEdge(1_450, words, 'end', -1)).toBe(1_400);
  });

  it('stays put past the last boundary', () => {
    expect(stepEdge(2_400, words, 'end', 1)).toBe(2_400);
    expect(stepEdge(1_000, words, 'start', -1)).toBe(1_000);
  });
});

describe('clipQuote', () => {
  it('is the words said wholly inside the clip', () => {
    const words = [word(1, 0, 400, 'So'), word(1, 500, 900, 'coffee'), word(1, 1_000, 1_400, 'dates')];
    expect(clipQuote(words, 450, 1_400)).toBe('coffee dates');
  });
});

describe('clipsFromLiveReel', () => {
  // A clip republished untouched must keep the claim it plays for, not go to the closest one.
  it('puts the live cuts on the player’s clock, keeping the claim each plays for', () => {
    const clips = clipsFromLiveReel(
      {
        clock: 'video',
        clips: [{ start_ms: 130_000, end_ms: 140_000, speaker_slot: 0, claim_index: 3, claim_text: 'Coffee' }],
      },
      RENDERED_TURN_SEGMENTS
    );
    expect(clips).toMatchObject([{ start_ms: 136_400, end_ms: 146_400, claim_index: 3, live_claim_text: 'Coffee' }]);
    expect(manualReelClips(clips)).toEqual([{ start: 136.4, end: 146.4, claim_index: 3 }]);
  });

  // A live cut is where geo-chat cut it: an edge an earlier publish cut `exact` must not be widened
  // by the next publish, so both edges load as free (`manualReel`).
  it('loads each live cut with both edges free, so an exact cut stays where it is', () => {
    const [live] = clipsFromLiveReel(
      {
        clock: 'video',
        clips: [{ start_ms: 750, end_ms: 2_500, speaker_slot: 0, claim_index: 0, claim_text: null }],
      },
      ONE_CLOCK
    );
    expect(edgeIsFree(live, 'start')).toBe(true);
    expect(edgeIsFree(live, 'end')).toBe(true);
    // 100 ms after "dates", where geo-chat would widen to 2.65 s.
    const words = [word(1, 1_000, 1_400), word(1, 2_000, 2_400), word(2, 3_000, 3_400)];
    expect(manualReel([live], words, ONE_CLOCK)).toEqual({
      clips: [{ start: 0.75, end: 2.5, claim_index: 0 }],
      exact: true,
    });
  });
});

// GEO-3672 / GEO-3683: geo-chat widens an edge in the quiet just beside a word by up to 250 ms,
// unless the reel is sent `exact`, which is the whole reel's.
describe('manualReel', () => {
  // 600 ms of quiet either side of "dates": up to 250 ms of room for a cut.
  const words = [word(1, 1_000, 1_400), word(1, 2_000, 2_400), word(2, 3_000, 3_400)];
  const freeEnd = (start: number, end: number, claim: number | null = null): EditorClip => ({
    ...clip(start, end, claim),
    free_end_ms: end,
  });

  it('sends a reel with no free edge as it is, without exact', () => {
    const clips = [clip(1_000, 2_400, 0), clip(3_000, 3_400)];
    expect(manualReel(clips, words, ONE_CLOCK)).toEqual({ clips: manualReelClips(clips) });
  });

  it('cuts an edge placed with Alt in the quiet beside a word exactly there, and widens the rest as geo-chat would', () => {
    // Clip 1's end, 100 ms after "dates", would have widened to 2.65 s.
    expect(manualReel([freeEnd(1_000, 2_500, 0), clip(3_000, 3_400)], words, ONE_CLOCK)).toEqual({
      clips: [
        // The word edges get their room: 250 ms with no word before, or past the end.
        { start: 0.75, end: 2.5, claim_index: 0 },
        { start: 2.75, end: 3.65 },
      ],
      exact: true,
    });
  });

  it('leaves exact off when no free edge would move: one set wider than the room, or mid-word', () => {
    const wide = [freeEnd(1_000, 2_900), clip(3_000, 3_400)];
    expect(manualReel(wide, words, ONE_CLOCK)).toEqual({ clips: manualReelClips(wide) });
    const midWord = [freeEnd(1_000, 3_200)];
    expect(manualReel(midWord, words, ONE_CLOCK)).toEqual({ clips: manualReelClips(midWord) });
  });

  it('counts an edge as free only while it is where Alt left it', () => {
    const moved = { ...freeEnd(1_000, 2_500), end_ms: 2_400 };
    expect(manualReel([moved], words, ONE_CLOCK)).toEqual({ clips: manualReelClips([moved]) });
  });

  // geo-chat checks a clip's length on the times sent, before its worker would have widened them.
  it('keeps a widened clip within 60 s, which geo-chat checks on what it is sent', () => {
    const long = [word(1, 10_000, 10_400), word(1, 69_500, 69_900), word(2, 75_000, 75_400)];
    const clips = [clip(10_000, 69_900), freeEnd(75_000, 75_500)];
    const sent = manualReel(clips, long, ONE_CLOCK);
    expect(sent.exact).toBe(true);
    const [first] = sent.clips;
    // Widened, 9.75-70.15 s; the excess comes off the end's room first, then the start's.
    expect(first).toEqual({ start: 9.901, end: 69.9 });
    expect(first.end - first.start).toBeLessThanOrEqual(60);
  });

  // geo-chat's `speech_turns` drops words with no text before it measures the room beside a word.
  it('measures the room beside a word past a blank word, as geo-chat does', () => {
    const withBlank = [word(1, 1_000, 1_400), word(1, 2_000, 2_400), word(1, 2_550, 2_600, ' '), word(2, 3_000, 3_400)];
    expect(manualReel([freeEnd(1_000, 2_500)], withBlank, ONE_CLOCK)).toEqual({
      clips: [{ start: 0.75, end: 2.5 }],
      exact: true,
    });
  });

  // GEO-3710: after a clip's last word geo-chat keeps only 10 ms clear of the speaker's own next
  // word (Whisper packs them 40 ms apart), still 60 ms of the other debater's, and none over a word
  // the other debater says across the end.
  it('widens an end before the speaker’s own next word into half the gap, but never into a reply', () => {
    const packed = [word(1, 1_000, 1_400), word(1, 1_440, 1_840), word(2, 1_880, 2_280), word(2, 3_000, 3_400)];
    expect(manualReel([clip(1_000, 1_400), clip(1_440, 1_840), freeEnd(3_000, 3_450)], packed, ONE_CLOCK)).toEqual({
      clips: [
        { start: 0.75, end: 1.42 },
        { start: 1.44, end: 1.84 },
        { start: 2.75, end: 3.45 },
      ],
      exact: true,
    });
  });

  it('measures an exchange’s end from the debater who says its last word', () => {
    // Debater 1's a0-a3 then debater 2's b0-b1, 40 ms apart; the clip ends on b0.
    const exchange = [
      word(1, 0, 400),
      word(1, 440, 840),
      word(1, 880, 1_280),
      word(1, 1_320, 1_720),
      word(2, 1_760, 2_160),
      word(2, 2_200, 2_600),
      word(1, 3_000, 3_400),
    ];
    expect(manualReel([clip(0, 2_160), freeEnd(3_000, 3_450)], exchange, ONE_CLOCK).clips[0]).toEqual({
      start: 0,
      end: 2.18,
    });
  });

  it('keeps an end where geo-chat does when the other debater says a word inside the last one', () => {
    // Debater 1 says 1-1.6 s; debater 2's "mm" (1.2-1.4 s) starts later, so it is the last word,
    // and debater 1's word said across its end leaves it no room: geo-chat ends at 1.6 s.
    const nested = [word(1, 1_000, 1_600), word(2, 1_200, 1_400, 'mm'), word(1, 3_000, 3_400)];
    expect(manualReel([clip(1_000, 1_600), freeEnd(3_000, 3_450)], nested, ONE_CLOCK).clips[0]).toEqual({
      start: 0.75,
      end: 1.6,
    });
  });

  it('takes the later of two of a debater’s words that start together as the last, as geo-chat does', () => {
    // A zero-length "uh" at 1.4 s, then a word from 1.4 s: the end is that word's, with room to 2.4 s.
    const tied = [word(1, 1_000, 1_400), word(1, 1_400, 1_400, 'uh'), word(1, 1_400, 1_700), word(1, 2_400, 2_800)];
    expect(manualReel([clip(1_000, 1_700), freeEnd(2_400, 2_850)], tied, ONE_CLOCK).clips[0]).toEqual({
      start: 0.75,
      end: 1.95,
    });
  });

  it('gives an end no room over a word the other debater says across it', () => {
    const crosstalk = [word(1, 1_000, 1_400), word(2, 1_300, 1_600), word(1, 2_000, 2_400), word(2, 3_000, 3_400)];
    expect(manualReel([clip(1_000, 1_400), freeEnd(3_000, 3_450)], crosstalk, ONE_CLOCK)).toEqual({
      clips: [
        { start: 0.75, end: 1.4 },
        { start: 2.75, end: 3.45 },
      ],
      exact: true,
    });
  });

  it('trims every edge to the stretch the recordings can cut, which exact would otherwise refuse', () => {
    // Two stretches on the player's clock: 0-2.45 s and 2.9-4 s, with a cut between.
    const turn = (index: number, slot: 1 | 2, output: [number, number], source: [number, number]) => ({
      turn_index: index,
      participant_slot: slot,
      output_start_ms: output[0],
      output_end_ms: output[1],
      duration_ms: output[1] - output[0],
      source_start_ms: source[0],
      source_end_ms: source[1],
    });
    const turns = [turn(0, 1, [0, 2_450], [0, 2_450]), turn(1, 2, [2_450, 3_550], [2_900, 4_000])];
    expect(manualReel([freeEnd(1_000, 2_430), clip(3_000, 3_400)], words, turns)).toEqual({
      clips: [
        { start: 0.75, end: 2.43 },
        // Widened to 2.75 s, but the stretch starts at 2.9 s.
        { start: 2.9, end: 3.65 },
      ],
      exact: true,
    });
  });
});

describe('clipsFromServedMoments', () => {
  it('reads the served moments’ word ranges onto the player’s clock and names their claims', () => {
    const clips = clipsFromServedMoments(
      [{ claim_index: 1, clip_start_ms: 130_000, clip_end_ms: 140_000 }, { claim_index: 0 }],
      [{ text: 'A' }, { text: 'B' }],
      RENDERED_TURN_SEGMENTS
    );
    expect(clips).toMatchObject([{ start_ms: 136_400, end_ms: 146_400, claim_index: 1, live_claim_text: 'B' }]);
  });
});

describe('clipProblems', () => {
  const words = [word(1, 130_000, 130_400), word(1, 140_000, 140_400)];

  it('finds nothing wrong with a clip inside one turn', () => {
    expect(clipProblems(clip(129_000, 141_000), words, RENDERED_TURN_SEGMENTS)).toEqual([]);
  });

  // 120 s to 128 s on the recordings is a condensed break. geo-chat trims an edge in it to the
  // stretch the clip's words are said in, so only words from two stretches are refused.
  it('takes an edge in a stretch the video cut when its words are in one turn', () => {
    expect(clipProblems(clip(124_000, 141_000), words, RENDERED_TURN_SEGMENTS)).toEqual([]);
  });

  // The live reel's cut at 121.2-131.2 s on the video reaches 0.4 s into the condensed break; it
  // loads at 127.6 s on the player's clock and must open publishable.
  it('opens a live reel cut whose edge room reaches into a condensed break as publishable', () => {
    const [live] = clipsFromLiveReel(
      {
        clock: 'video',
        clips: [{ start_ms: 121_200, end_ms: 131_200, speaker_slot: 0, claim_index: null, claim_text: null }],
      },
      RENDERED_TURN_SEGMENTS
    );
    expect(live.start_ms).toBe(127_600);
    expect(clipProblems(live, [word(1, 128_100, 128_500), ...words], RENDERED_TURN_SEGMENTS)).toEqual([]);
  });

  it('refuses a clip whose words cross a cut', () => {
    const across = [word(2, 115_000, 115_400), ...words];
    expect(clipProblems(clip(110_000, 131_000), across, RENDERED_TURN_SEGMENTS)).toEqual([
      'Its words cross a cut in the video. Keep them inside one stretch.',
    ]);
    // On one clock there is no cut to cross.
    expect(clipProblems(clip(110_000, 131_000), across, ONE_CLOCK)).toEqual([]);
  });

  // geo-chat merges turns that follow one another on the recordings into one real-speed stretch,
  // so a reply within an Open round can be clipped with the point it answers.
  it('takes words across a handoff with nothing cut between the turns', () => {
    const handoff = [word(1, 59_000, 59_600), word(2, 60_400, 61_000)];
    expect(clipProblems(clip(58_500, 61_500), handoff, RENDERED_TURN_SEGMENTS)).toEqual([]);
    expect(realSpeedStretches(RENDERED_TURN_SEGMENTS)).toEqual([
      { start_ms: 0, end_ms: 120_000 },
      { start_ms: 128_000, end_ms: 218_000 },
      { start_ms: 229_950, end_ms: 270_944 },
      // An early end's quiet is cut between turns 4 and 5: they abut on the video, not the recordings.
      { start_ms: 274_650, end_ms: 321_086 },
    ]);
  });

  it('judges by the edges when there are no words', () => {
    expect(clipProblems(clip(124_000, 141_000), [], RENDERED_TURN_SEGMENTS)).toContain(
      'Its start falls in a stretch the video cut. Move it into a turn.'
    );
    expect(clipProblems(clip(110_000, 131_000), [], RENDERED_TURN_SEGMENTS)).toContain(
      'It crosses a cut in the video. Keep it inside one stretch.'
    );
  });

  it('refuses a clip longer than geo-chat takes, backwards, or without a whole word', () => {
    expect(clipProblems(clip(129_000, 190_000), words, ONE_CLOCK)).toContain('It runs over 60 s, the most a clip can.');
    expect(clipProblems(clip(141_000, 129_000), words, ONE_CLOCK)).toEqual(['It ends before it starts.']);
    expect(clipProblems(clip(131_000, 139_000), words, ONE_CLOCK)).toEqual(['Nobody says a whole word in it.']);
  });
});

describe('reelProblems', () => {
  const words = [word(1, 1_000, 1_400), word(2, 5_000, 5_400)];

  it('takes 1 to 6 clips', () => {
    expect(reelProblems([], words)).toEqual(['A reel needs at least one clip.']);
    expect(
      reelProblems(
        Array.from({ length: 7 }, (_, i) => clip(i * 10_000, i * 10_000 + 1)),
        []
      )
    ).toEqual(['A reel has at most 6 clips.']);
  });

  it('refuses two clips that say exactly the same words, which geo-chat cannot both keep', () => {
    expect(reelProblems([clip(900, 1_500), clip(800, 1_600), clip(4_900, 5_500)], words)).toEqual([
      'Clips 1 and 2 say exactly the same words.',
    ]);
  });
});

describe('manualReelClips', () => {
  it('sends seconds on the player’s clock, and a claim only where the admin picked one', () => {
    expect(manualReelClips([clip(1_250, 9_000), clip(10_000, 20_500, 4)])).toEqual([
      { start: 1.25, end: 9 },
      { start: 10, end: 20.5, claim_index: 4 },
    ]);
  });
});

describe('reel times', () => {
  it('formats m:ss.s and reads it back, or plain seconds', () => {
    expect(formatReelTime(75_340)).toBe('1:15.3');
    expect(formatReelTime(5_000)).toBe('0:05.0');
    expect(parseReelTime('1:15.3')).toBe(75_300);
    expect(parseReelTime('75.3')).toBe(75_300);
    expect(parseReelTime(' 0:05 ')).toBe(5_000);
  });

  it('reads nothing that is not a time', () => {
    expect(parseReelTime('1:75')).toBeNull();
    expect(parseReelTime('soon')).toBeNull();
    expect(parseReelTime('')).toBeNull();
  });
});
