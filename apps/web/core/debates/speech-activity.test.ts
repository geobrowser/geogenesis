import { describe, expect, it } from 'vitest';

import {
  GATE_CLOSE_DECIBELS,
  GATE_CLOSE_DELAY_MS,
  GATE_OPEN_DECIBELS,
  GATE_OPEN_DELAY_MS,
  decibelsFromSamples,
  initialSpeechGateState,
  stepSpeechGate,
} from './speech-activity';

const LOUD = GATE_OPEN_DECIBELS + 10;
const QUIET = GATE_CLOSE_DECIBELS - 10;

/** Feed one level for a stretch of time, a sample every 16ms. */
function hold(state = initialSpeechGateState, decibels: number, durationMs: number, from = 0) {
  let current = state;
  for (let t = from; t <= from + durationMs; t += 16) current = stepSpeechGate(current, decibels, t);
  return current;
}

describe('speech gate', () => {
  it('starts closed and opens once speech persists', () => {
    expect(initialSpeechGateState.open).toBe(false);
    const brief = hold(initialSpeechGateState, LOUD, GATE_OPEN_DELAY_MS - 32);
    expect(brief.open).toBe(false);
    expect(hold(initialSpeechGateState, LOUD, GATE_OPEN_DELAY_MS + 32).open).toBe(true);
  });

  // The whole point. A speaker pausing mid-sentence must not read as having finished, or their
  // microphone closes on the breath between two clauses.
  it('holds through a pause shorter than the close delay', () => {
    const open = hold(initialSpeechGateState, LOUD, 500);
    const pausing = hold(open, QUIET, GATE_CLOSE_DELAY_MS - 64, 500);
    expect(pausing.open).toBe(true);
  });

  it('closes once the quiet outlasts the close delay', () => {
    const open = hold(initialSpeechGateState, LOUD, 500);
    expect(hold(open, QUIET, GATE_CLOSE_DELAY_MS + 64, 500).open).toBe(false);
  });

  // Asymmetric by design: quicker to believe speech started than that it stopped.
  it('is quicker to open than to close', () => {
    expect(GATE_OPEN_DELAY_MS).toBeLessThan(GATE_CLOSE_DELAY_MS);
    expect(GATE_CLOSE_DECIBELS).toBeLessThan(GATE_OPEN_DECIBELS);
  });

  // Between the two thresholds nothing should change, which is what stops the gate chattering.
  it('does not flip inside the hysteresis band', () => {
    const between = (GATE_OPEN_DECIBELS + GATE_CLOSE_DECIBELS) / 2;
    expect(hold(initialSpeechGateState, between, 5_000).open).toBe(false);
    const open = hold(initialSpeechGateState, LOUD, 500);
    expect(hold(open, between, 5_000, 500).open).toBe(true);
  });

  it('restarts the countdown when the signal comes back', () => {
    const open = hold(initialSpeechGateState, LOUD, 500);
    const halfway = hold(open, QUIET, GATE_CLOSE_DELAY_MS - 64, 500);
    const resumed = stepSpeechGate(halfway, LOUD, 900);
    expect(resumed.transitionStartedAt).toBeNull();
    expect(hold(resumed, QUIET, GATE_CLOSE_DELAY_MS - 64, 900).open).toBe(true);
  });

  describe('decibelsFromSamples', () => {
    it('reads true digital silence as negative infinity', () => {
      expect(decibelsFromSamples(new Float32Array(128))).toBe(Number.NEGATIVE_INFINITY);
    });

    it('reads a full-scale signal as roughly 0 dBFS, and a quiet one as far below', () => {
      expect(decibelsFromSamples(new Float32Array(64).fill(1))).toBeCloseTo(0, 5);
      expect(decibelsFromSamples(new Float32Array(64).fill(0.001))).toBeLessThan(-50);
    });
  });
});
