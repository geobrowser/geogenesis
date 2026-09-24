import type { Debate, ParticipantSlot } from './api';

/**
 * The furthest a speaker's microphone will stay live past the end of their turn.
 *
 * GEO-2915. The gate used to close on the exact instant `activeSlot` moved off you, and because the
 * `MediaRecorder` holds the same `MediaStreamTrack` that gets disabled, the words were not merely
 * unheard — they were never recorded. Measured across every debate with a transcript, 184 of 530
 * turns (34.7%) ended at exactly the buzzer, and decoding the raw recordings showed *digital zero*
 * from that instant rather than room tone.
 *
 * This is only the ceiling. The microphone normally closes as soon as the speaker actually stops,
 * which the noise gate in `speech-activity` decides from their own signal — a fixed window is
 * wrong for every sentence of a different length, which is why the first version of this was too
 * short for some and needlessly long for others. The cap can be this generous *because* silence
 * closes it early; it exists only so a fan, a sustained cough or a noisy room cannot hold a
 * microphone open indefinitely.
 */
export const MIC_OVERRUN_MAX_MS = 3_000;

/**
 * How early the incoming speaker's microphone opens.
 *
 * The other half of the same dead air. `activeSlot` flips only once the client has learned from the
 * server that the turn advanced, and measurement put that at roughly two seconds: the incoming
 * speaker's own recording was 100% digital zero for a full second into their turn and not fully
 * live until ~2s. The countdown, by contrast, runs on the local clock and knows when the turn is
 * about to end — so opening on the countdown rather than on the confirmation closes the gap.
 */
export const MIC_PREARM_BEFORE_TURN_MS = 1_000;

export type LocalAudioGateInput = {
  effectiveStatus: Debate['status'] | null;
  activeSlot: ParticipantSlot | null;
  localSlot: ParticipantSlot | null;
  /** The viewer muted themselves, or yielded deliberately. Always wins. */
  audioMuted: boolean;
  /** Milliseconds since this participant's turn ended, or null if they were not the last speaker. */
  msSinceTurnEnded: number | null;
  /**
   * Whether this participant's own microphone still reads as speech, per `speech-activity`.
   *
   * What actually ends the overrun. The gate's close delay already absorbs the pause between
   * clauses, so by the time this goes false the sentence really is over.
   */
  stillSpeaking: boolean;
  /** Milliseconds until this participant's turn opens, or null if it is not next. */
  msUntilTurnStarts: number | null;
};

/**
 * Whether the local microphone track should be live.
 *
 * Kept pure and in its own module deliberately: this rule decides what ends up in the recording, it
 * was wrong for months, and it was previously a private function inside a 3,000-line component with
 * no tests of its own.
 */
export function shouldEnableLocalAudio({
  effectiveStatus,
  activeSlot,
  localSlot,
  audioMuted,
  msSinceTurnEnded,
  stillSpeaking,
  msUntilTurnStarts,
}: LocalAudioGateInput): boolean {
  if (audioMuted || !effectiveStatus || !localSlot) return false;
  // The intro is an open two-way call; turn-taking starts with the debate. Load-bearing: the turn
  // rule below would otherwise disable the published microphone track and the mic meter with it.
  if (effectiveStatus === 'ready') return true;
  if (effectiveStatus === 'thanking') return true;
  if (effectiveStatus !== 'in_progress') return false;

  if (activeSlot === localSlot) return true;
  // Past the buzzer: hold only while they are genuinely still talking, and never past the cap.
  // Someone who stopped on time keeps the clean cut they always had — no dead air is added.
  if (stillSpeaking && msSinceTurnEnded !== null && msSinceTurnEnded < MIC_OVERRUN_MAX_MS) return true;
  if (msUntilTurnStarts !== null && msUntilTurnStarts <= MIC_PREARM_BEFORE_TURN_MS) return true;
  return false;
}
