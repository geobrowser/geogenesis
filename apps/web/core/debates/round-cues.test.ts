import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment, ParticipantSlot } from './api';
import { turnSpansForDurations, turnSpansFromSegments } from './playback-utils';
import { ROUND_CARD_MS, roundBadgeAt, roundCardAt, roundLabel } from './round-cues';

/** Four turns of 60s — two rounds, slot 1 opening. */
const spans = turnSpansForDurations(1, [60_000, 60_000, 60_000, 60_000]);
const TURNS = 4;

describe('roundLabel', () => {
  it('counts rounds rather than turns, because that is what a viewer counts', () => {
    // Both debaters speaking is one round; numbering the turns would call this a four-round debate.
    expect(roundLabel(0, 4)).toBe('Round 1 · Opening');
    expect(roundLabel(1, 4)).toBe('Round 1 · Opening');
    expect(roundLabel(2, 4)).toBe('Round 2 · Rebuttal');
    expect(roundLabel(3, 4)).toBe('Round 2 · Rebuttal');
  });

  it('gives a three-round format its closing arguments (GEO-2852)', () => {
    expect(roundLabel(0, 6)).toBe('Round 1 · Opening');
    expect(roundLabel(2, 6)).toBe('Round 2 · Rebuttal');
    expect(roundLabel(4, 6)).toBe('Round 3 · Closing');
  });
});

describe('roundCardAt', () => {
  it('hands the card the round and its name apart, and the badge the single line', () => {
    // Two surfaces with different room for the same fact: the card stacks them large, the badge
    // has one line beside a timer.
    expect(roundCardAt(spans, TURNS, 0.5)).toMatchObject({
      round: 'Round 1',
      role: 'Opening',
      label: 'Round 1 · Opening',
    });
  });

  it('leaves the name off a middle round the format does not name', () => {
    // Eight turns: the second round is neither an opening, a rebuttal nor a closing.
    const long = turnSpansForDurations(1, Array(8).fill(60_000));
    expect(roundCardAt(long, 8, 120.5)).toMatchObject({ round: 'Round 2', role: null, label: 'Round 2' });
  });

  it('announces the round as it opens', () => {
    expect(roundCardAt(spans, TURNS, 0.5)?.label).toBe('Round 1 · Opening');
    expect(roundCardAt(spans, TURNS, 120.5)?.label).toBe('Round 2 · Rebuttal');
  });

  it('says nothing again when the other debater replies — it is the same round', () => {
    // Turn 2 of 4 starts at 60s. The announcement is about the round, and the round has already
    // been announced; the badge beside the timer is what carries it from here.
    expect(roundCardAt(spans, TURNS, 60.5)).toBeNull();
    expect(roundCardAt(spans, TURNS, 180.5)).toBeNull();
  });

  it('announces a final unpaired turn, which opens a round of its own', () => {
    // Three turns: the last is a lone closing statement, and it should be named.
    const odd = turnSpansForDurations(1, [60_000, 60_000, 60_000]);
    expect(roundCardAt(odd, 3, 120.5)?.label).toBe('Round 2 · Rebuttal');
  });

  it('is gone for the rest of the turn', () => {
    expect(roundCardAt(spans, TURNS, ROUND_CARD_MS / 1_000 + 0.1)).toBeNull();
    expect(roundCardAt(spans, TURNS, 30)).toBeNull();
  });

  it('fades in rather than blinking into place', () => {
    const early = roundCardAt(spans, TURNS, 0.05)?.opacity ?? 0;
    const settled = roundCardAt(spans, TURNS, 0.5)?.opacity ?? 0;

    expect(early).toBeLessThan(settled);
    expect(settled).toBe(1);
  });

  it('is a function of the playhead, so a scrub lands on the strength the moment had', () => {
    expect(roundCardAt(spans, TURNS, 120.4)?.opacity).toBe(roundCardAt(spans, TURNS, 120.4)?.opacity);
    expect(roundCardAt(spans, TURNS, 120.4)?.opacity).toBe(1);
  });

  it('says nothing at all for a debate with no turns, or past the last one', () => {
    expect(roundCardAt([], TURNS, 1)).toBeNull();
    expect(roundCardAt(spans, TURNS, 240)).toBeNull();
  });
});

describe('roundBadgeAt', () => {
  it('holds the round for the rest of the turn, once the card has gone', () => {
    expect(roundBadgeAt(spans, TURNS, 30)?.label).toBe('Round 1 · Opening');
    expect(roundBadgeAt(spans, TURNS, 150)?.label).toBe('Round 2 · Rebuttal');
  });

  it('carries the same round across to the replying debater', () => {
    // The badge is drawn beside whichever timer is counting, so this is how a round stays legible
    // as something the two of them are in together.
    expect(roundBadgeAt(spans, TURNS, 90)?.label).toBe('Round 1 · Opening');
    expect(roundBadgeAt(spans, TURNS, 210)?.label).toBe('Round 2 · Rebuttal');
  });

  it('arrives with the reply, where there is no card to wait for', () => {
    // Turn 2 starts at 60s: a quarter-second in, the badge is already most of the way up.
    expect(roundBadgeAt(spans, TURNS, 60.25)?.opacity).toBeGreaterThan(0.9);
  });

  it('comes up over the card going down, so the two read as one movement', () => {
    // Mid-handover: the card is still on screen and the badge is already arriving.
    const during = (ROUND_CARD_MS - 150) / 1_000;
    expect(roundCardAt(spans, TURNS, during)).not.toBeNull();
    const arriving = roundBadgeAt(spans, TURNS, during)?.opacity ?? 0;

    expect(arriving).toBeGreaterThan(0);
    expect(arriving).toBeLessThan(1);
  });

  it('is not up at the very start of a round, where the card is saying it', () => {
    expect(roundBadgeAt(spans, TURNS, 0.2)).toBeNull();
    expect(roundBadgeAt(spans, TURNS, 120.2)).toBeNull();
  });

  it('is at full strength for the body of the turn', () => {
    expect(roundBadgeAt(spans, TURNS, 30)?.opacity).toBe(1);
  });
});

describe('against the rendered segments', () => {
  it('names a turn by its own turn_index, not by where it landed in the array', () => {
    // An instant yield renders a zero-length segment, which `sortTurnSegments` drops. Numbering by
    // position would slide every later turn down one — round 2's card would never fire and its
    // rebuttal would be captioned "Round 1 · Opening".
    const kept = turnSpansFromSegments([
      { turn_index: 0, participant_slot: 1, output_start_ms: 0, output_end_ms: 60_000, duration_ms: 60_000 },
      // turn 1 yielded instantly and never made it through the filter.
      { turn_index: 2, participant_slot: 1, output_start_ms: 60_000, output_end_ms: 120_000, duration_ms: 60_000 },
    ]);

    expect(roundCardAt(kept, 4, 60.5)?.label).toBe('Round 2 · Rebuttal');
  });

  it('classifies the round off the format rather than off what the render kept', () => {
    // Six turns rendered of an eight-turn format. Counting the spans would make round 3 the last
    // one and caption a rebuttal "Closing".
    const short = turnSpansForDurations(1, Array(6).fill(60_000));

    expect(roundCardAt(short, 8, 240.5)?.label).toBe('Round 3 · Rebuttal');
    expect(roundCardAt(short, 6, 240.5)?.label).toBe('Round 3 · Closing');
  });

  const segment = (
    turn_index: number,
    participant_slot: ParticipantSlot,
    output_start_ms: number,
    output_end_ms: number
  ): DebateMediaTurnSegment => ({
    turn_index,
    participant_slot,
    output_start_ms,
    output_end_ms,
    duration_ms: output_end_ms - output_start_ms,
  });

  it('names the rounds the render actually cut, not the format allowance (GEO-2949)', () => {
    // An early yield makes the second turn start well before the allowance says it does.
    const cut = turnSpansFromSegments([segment(0, 1, 0, 20_000), segment(1, 2, 20_000, 80_000)]);

    expect(roundCardAt(cut, 2, 0.5)?.label).toBe('Round 1 · Opening');
    // The reply starts at 20s rather than at the allowance's 60s, and the badge follows it there.
    expect(roundBadgeAt(cut, 2, 20.5)?.label).toBe('Round 1 · Opening');
    expect(roundBadgeAt(cut, 2, 19.9)?.opacity).toBe(1);
  });

  it('sorts defensively, the way every other segment reader here does', () => {
    const late = segment(1, 2, 30_000, 60_000);
    const early = segment(0, 1, 0, 30_000);

    expect(turnSpansFromSegments([late, early]).map(span => span.slot)).toEqual([1, 2]);
  });
});
