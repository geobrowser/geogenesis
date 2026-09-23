import { describe, expect, it } from 'vitest';

import type { DebateMediaTurnSegment, ParticipantSlot } from './api';
import { type TurnSpan, turnSpansForDurations, turnSpansFromSegments } from './playback-utils';
import { GO_MS, ROUND_MS, TIME_MS, type TurnCueKind, roundLabel, turnCueForSlot, turnCuesAt } from './turn-cues';

/** Two 60s turns, slot 1 first — the shape every assertion below reasons about. */
const spans = turnSpansForDurations(1, [60_000, 60_000]);

function kindsAt(seconds: number, source: TurnSpan[] = spans): Record<ParticipantSlot, TurnCueKind | null> {
  const cues = turnCuesAt(source, seconds);
  return {
    1: turnCueForSlot(cues, 1)?.kind ?? null,
    2: turnCueForSlot(cues, 2)?.kind ?? null,
  };
}

describe('turnCuesAt', () => {
  it('rests through the middle of a turn', () => {
    expect(turnCuesAt(spans, 30)).toEqual([]);
  });

  it('opens the video with a title rather than a shout', () => {
    // The first turn has no `GO!` — nothing has happened yet for it to start — so the round card
    // runs from the first frame and tells a feed viewer what they have scrolled into.
    const opening = turnCueForSlot(turnCuesAt(spans, 0.5), 1);
    expect(opening?.kind).toBe('round');
    expect(opening?.label).toBe('Round 1 · Opening');
  });

  it('names the round once GO! is done with the tile', () => {
    expect(kindsAt(60 + GO_MS / 2_000)[2]).toBe('go');
    const after = turnCueForSlot(turnCuesAt(spans, 60 + (GO_MS + 400) / 1_000), 2);
    expect(after?.kind).toBe('round');
    expect(after?.label).toBe('Round 1 · Opening');
  });

  it('drops the round card before the turn is under way', () => {
    expect(kindsAt(60 + (GO_MS + ROUND_MS) / 1_000 + 0.1)[2]).toBeNull();
  });

  it('says nothing at all when the debate has no turns', () => {
    expect(turnCuesAt([], 10)).toEqual([]);
  });

  it('says nothing past the end of the last turn', () => {
    expect(turnCuesAt(spans, 120)).toEqual([]);
  });

  describe('the speaking tile', () => {
    it('warns at five seconds and counts at three', () => {
      expect(kindsAt(55.5)[1]).toBe('wrap-up');
      expect(kindsAt(57.5)[1]).toBe('countdown');
    });

    it('counts whole seconds down, the way the room does', () => {
      // 2.4s left reads as 3, because it is read rather than measured.
      expect(turnCueForSlot(turnCuesAt(spans, 57.6), 1)?.seconds).toBe(3);
      expect(turnCueForSlot(turnCuesAt(spans, 58.5), 1)?.seconds).toBe(2);
      expect(turnCueForSlot(turnCuesAt(spans, 59.5), 1)?.seconds).toBe(1);
    });

    it('shouts GO! on the incoming tile at a turn change', () => {
      expect(kindsAt(60 + GO_MS / 2_000)[2]).toBe('go');
    });

    it('does not shout GO! on the opening turn, which has nothing behind it', () => {
      expect(kindsAt(0.5)[1]).toBe('round');
    });
  });

  describe('the other tile', () => {
    it('buzzes the debater who has just finished while the next one starts', () => {
      const at = 60 + TIME_MS / 2_000;
      expect(kindsAt(at)).toEqual({ 1: 'time', 2: 'go' });
    });

    it('drops the buzzer before GO! is done, so the outgoing tile clears first', () => {
      const at = 60 + (TIME_MS + GO_MS) / 2_000;
      expect(kindsAt(at)).toEqual({ 1: null, 2: 'go' });
    });

    it('announces the hand-off once, ten seconds out', () => {
      const cue = turnCueForSlot(turnCuesAt(spans, 50.5), 2);
      expect(cue?.kind).toBe('up-next');
      expect(cue?.seconds).toBe(10);
    });

    it('leaves again rather than counting down over the other debater', () => {
      // Ten seconds of anything across the middle of a tile is far past the budget every other
      // phrase here is held to.
      expect(kindsAt(55)[2]).toBeNull();
    });

    it('has nobody to point at on the final turn', () => {
      // 112s is eight seconds from the end of the second and last turn — inside the up-next
      // window, with no turn after it to announce.
      expect(kindsAt(112)).toEqual({ 1: null, 2: null });
      expect(turnCuesAt(turnSpansForDurations(1, [60_000]), 52)).toEqual([]);
    });
  });

  describe('the two tiles together', () => {
    it('never puts two cues on one tile', () => {
      for (let seconds = 0; seconds < 120; seconds += 0.1) {
        const cues = turnCuesAt(spans, seconds);
        const slots = cues.map(cue => cue.slot);
        expect(new Set(slots).size).toBe(slots.length);
      }
    });

    it('never returns a cue that would draw nothing', () => {
      for (let seconds = 0; seconds < 120; seconds += 0.1) {
        for (const cue of turnCuesAt(spans, seconds)) expect(cue.opacity).toBeGreaterThan(0);
      }
    });
  });

  describe('opacity', () => {
    it('fades in rather than blinking into place', () => {
      const early = turnCueForSlot(turnCuesAt(spans, 60.05), 2);
      const settled = turnCueForSlot(turnCuesAt(spans, 60.4), 2);
      expect(early?.opacity).toBeLessThan(settled?.opacity ?? 0);
      expect(settled?.opacity).toBe(1);
    });

    it('gives each numeral its own beat, so the digit lands rather than crossfading', () => {
      // Squarely inside a beat: full strength.
      expect(turnCueForSlot(turnCuesAt(spans, 57.5), 1)?.opacity).toBe(1);
      // On the boundary between two numerals the outgoing one has gone and the incoming one has
      // not arrived, which is what makes three numerals read as three beats rather than a blur.
      expect(turnCueForSlot(turnCuesAt(spans, 58), 1)).toBeNull();
    });
  });

  describe('against the rendered segments', () => {
    const segment = (
      turn_index: number,
      participant_slot: ParticipantSlot,
      output_start_ms: number,
      output_end_ms: number,
      countdown_start_ms?: number
    ): DebateMediaTurnSegment => ({
      turn_index,
      participant_slot,
      output_start_ms,
      output_end_ms,
      duration_ms: output_end_ms - output_start_ms,
      countdown_start_ms,
    });

    it('counts down the clock the debaters saw, not the cut', () => {
      // A turn whose render retained five seconds of speech from before the clock started. The
      // room counted 30s; the segment is 35s long.
      const withLeadIn = turnSpansFromSegments([
        segment(0, 1, 0, 35_000, 5_000),
        segment(1, 2, 35_000, 70_000, 40_000),
      ]);
      // 32.5s in: 2.5s left, which reads as the numeral 3.
      expect(turnCueForSlot(turnCuesAt(withLeadIn, 32.5), 1)?.seconds).toBe(3);
      // 2s in, while the clock has not started: the full 30s is still to come, so nothing fires.
      expect(turnCuesAt(withLeadIn, 2)).toEqual([]);
    });

    it('keeps an early yield honest — a short turn still warns before it ends', () => {
      const earlyYield = turnSpansFromSegments([segment(0, 1, 0, 20_000), segment(1, 2, 20_000, 80_000)]);
      expect(turnCueForSlot(turnCuesAt(earlyYield, 16.5), 1)?.kind).toBe('wrap-up');
      expect(turnCueForSlot(turnCuesAt(earlyYield, 20.5), 2)?.kind).toBe('go');
    });
  });
});

describe('roundLabel', () => {
  it('counts rounds rather than turns, because that is what a viewer counts', () => {
    expect(roundLabel(0, 4)).toBe('Round 1 · Opening');
    expect(roundLabel(1, 4)).toBe('Round 1 · Opening');
    expect(roundLabel(2, 4)).toBe('Round 2 · Rebuttal');
  });

  it('gives a three-round format its closing arguments (GEO-2852)', () => {
    expect(roundLabel(2, 6)).toBe('Round 2 · Rebuttal');
    expect(roundLabel(4, 6)).toBe('Round 3 · Closing');
  });
});
