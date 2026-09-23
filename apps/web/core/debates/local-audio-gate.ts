import type { Debate, ParticipantSlot } from './api';

/**
 * How long a speaker's microphone stays live after their turn ends.
 *
 * GEO-2915. The gate used to close on the exact instant `activeSlot` moved off you, and because the
 * `MediaRecorder` holds the same `MediaStreamTrack` that gets disabled, the words were not merely
 * unheard — they were never recorded. Measured across every debate with a transcript, 184 of 530
 * turns (34.7%) ended at exactly the buzzer, and decoding the raw recordings showed *digital zero*
 * from that instant rather than room tone. Nothing downstream can recover audio that was never
 * captured, so the fix has to be here.
 *
 * 1.5s is the tail of a sentence someone is already finishing, not a licence to keep talking. The
 * render still ends the turn on the clock, so this buys the words, not extra debating time.
 */
export const MIC_OVERRUN_AFTER_TURN_MS = 1_500;

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
  msUntilTurnStarts,
}: LocalAudioGateInput): boolean {
  if (audioMuted || !effectiveStatus || !localSlot) return false;
  // The intro is an open two-way call; turn-taking starts with the debate. Load-bearing: the turn
  // rule below would otherwise disable the published microphone track and the mic meter with it.
  if (effectiveStatus === 'ready') return true;
  if (effectiveStatus === 'thanking') return true;
  if (effectiveStatus !== 'in_progress') return false;

  if (activeSlot === localSlot) return true;
  if (msSinceTurnEnded !== null && msSinceTurnEnded < MIC_OVERRUN_AFTER_TURN_MS) return true;
  if (msUntilTurnStarts !== null && msUntilTurnStarts <= MIC_PREARM_BEFORE_TURN_MS) return true;
  return false;
}
