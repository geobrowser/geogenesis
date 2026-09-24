import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment, ParticipantSlot } from './api';
import { turnSpansForDurations, turnSpansFromSegments } from './playback-utils';
import { ROUND_CARD_MS, roundBadgeAt, roundCardAt, roundLabel } from './round-cues';

/** Four turns of 60s — two rounds, slot 1 opening. */
const spans = turnSpansForDurations(1, [60_000, 60_000, 60_000, 60_000]);

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
  it('announces the round as the turn opens', () => {
    expect(roundCardAt(spans, 0.5)?.label).toBe('Round 1 · Opening');
    expect(roundCardAt(spans, 120.5)?.label).toBe('Round 2 · Rebuttal');
  });

  it('is gone for the rest of the turn', () => {
    expect(roundCardAt(spans, ROUND_CARD_MS / 1_000 + 0.1)).toBeNull();
    expect(roundCardAt(spans, 30)).toBeNull();
  });

  it('fades in rather than blinking into place', () => {
    const early = roundCardAt(spans, 0.05)?.opacity ?? 0;
    const settled = roundCardAt(spans, 0.5)?.opacity ?? 0;

    expect(early).toBeLessThan(settled);
    expect(settled).toBe(1);
  });

  it('is a function of the playhead, so a scrub lands on the strength the moment had', () => {
    expect(roundCardAt(spans, 60.4)?.opacity).toBe(roundCardAt(spans, 60.4)?.opacity);
    expect(roundCardAt(spans, 60.4)?.opacity).toBe(1);
  });

  it('says nothing at all for a debate with no turns, or past the last one', () => {
    expect(roundCardAt([], 1)).toBeNull();
    expect(roundCardAt(spans, 240)).toBeNull();
  });
});

describe('roundBadgeAt', () => {
  it('holds the round for the rest of the turn, once the card has gone', () => {
    expect(roundBadgeAt(spans, 30)?.label).toBe('Round 1 · Opening');
    expect(roundBadgeAt(spans, 150)?.label).toBe('Round 2 · Rebuttal');
  });

  it('comes up over the card going down, so the two read as one movement', () => {
    // Mid-handover: the card is still on screen and the badge is already arriving.
    const during = (ROUND_CARD_MS - 150) / 1_000;
    expect(roundCardAt(spans, during)).not.toBeNull();
    const arriving = roundBadgeAt(spans, during)?.opacity ?? 0;

    expect(arriving).toBeGreaterThan(0);
    expect(arriving).toBeLessThan(1);
  });

  it('is not up at the very start of a turn, where the card is saying it', () => {
    expect(roundBadgeAt(spans, 0.2)).toBeNull();
  });

  it('is at full strength for the body of the turn', () => {
    expect(roundBadgeAt(spans, 30)?.opacity).toBe(1);
  });
});

describe('against the rendered segments', () => {
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

    expect(roundCardAt(cut, 20.5)?.label).toBe('Round 1 · Opening');
    expect(roundCardAt(cut, 0.5)?.label).toBe('Round 1 · Opening');
  });

  it('sorts defensively, the way every other segment reader here does', () => {
    const late = segment(1, 2, 30_000, 60_000);
    const early = segment(0, 1, 0, 30_000);

    expect(turnSpansFromSegments([late, early]).map(span => span.slot)).toEqual([1, 2]);
  });
});
