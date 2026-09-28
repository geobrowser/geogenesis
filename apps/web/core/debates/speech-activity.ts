/**
 * Is someone speaking right now, from the microphone's own signal.
 *
 * Extracted from `MicrophoneLevelMeter`, which has carried this gate — with these thresholds and
 * these delays — since the meter shipped. GEO-2915 needs the same question answered for a
 * different purpose: deciding when a speaker has actually finished so their microphone can close,
 * rather than closing it on a fixed timer that is wrong for every sentence of a different length.
 *
 * Hysteresis on both the level and the time. A single threshold chatters on the breath between
 * words, and the open and close delays are deliberately asymmetric: opening fast keeps the first
 * syllable, closing slowly keeps the pause in the middle of a sentence from reading as the end of
 * one.
 */

/** Above this, treat it as speech starting. */
export const GATE_OPEN_DECIBELS = -50;
/** Below this, treat it as speech stopping. Lower than the open threshold on purpose. */
export const GATE_CLOSE_DECIBELS = -52;
export const GATE_OPEN_DELAY_MS = 100;
export const GATE_CLOSE_DELAY_MS = 300;

export type SpeechGateState = {
  /** Whether the gate currently reads as speech. */
  open: boolean;
  /** When the current threshold crossing began, or null when the signal agrees with the gate. */
  transitionStartedAt: number | null;
};

export const initialSpeechGateState: SpeechGateState = { open: false, transitionStartedAt: null };

/**
 * Advance the gate by one sample.
 *
 * Pure so the behaviour that decides whether a debater's last words are recorded can be tested
 * without an `AudioContext`, a microphone or a browser.
 */
export function stepSpeechGate(state: SpeechGateState, decibels: number, timestamp: number): SpeechGateState {
  const crossing = state.open ? decibels < GATE_CLOSE_DECIBELS : decibels > GATE_OPEN_DECIBELS;
  if (!crossing) return state.transitionStartedAt === null ? state : { ...state, transitionStartedAt: null };

  const startedAt = state.transitionStartedAt ?? timestamp;
  const delay = state.open ? GATE_CLOSE_DELAY_MS : GATE_OPEN_DELAY_MS;
  if (timestamp - startedAt < delay) return { ...state, transitionStartedAt: startedAt };
  return { open: !state.open, transitionStartedAt: null };
}

/** RMS of a time-domain buffer, in dBFS. `-Infinity` for true digital silence. */
export function decibelsFromSamples(samples: ArrayLike<number>): number {
  let sumOfSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    sumOfSquares += sample * sample;
  }
  const rms = Math.sqrt(sumOfSquares / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
}
