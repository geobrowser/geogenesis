import type { Debate, ParticipantSlot } from './api';
import type { OpenRoundsRoomPhase } from './open-rounds';

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
 * which `useTurnOverrun` decides from their own signal (a pause of `OVERRUN_PAUSE_HOLD_MS`) — a fixed window is
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
   * Whether this participant is still talking past the buzzer, per `useTurnOverrun`.
   *
   * What actually ends the overrun. It holds through a pause between clauses, up to
   * `OVERRUN_PAUSE_HOLD_MS`, so by the time this goes false the sentence really is over (GEO-3470).
   */
  stillSpeaking: boolean;
  /** Milliseconds until this participant's turn opens, or null if it is not next. */
  msUntilTurnStarts: number | null;
  /**
   * Voting opens both microphones. The result, round title, count-in and required-round lead-in
   * keep both closed, including the incoming-speaker prearm. A turn's overrun still carries into
   * them (GEO-3407): a round's second turn ends straight into one, and closing it there cut the
   * second speaker off mid-sentence at the end of every round.
   */
  openRoundsPhase: OpenRoundsRoomPhase['phase'] | null;
  /** The final wrap/max board stays up briefly after the room enters thanking. */
  openRoundResultHeld: boolean;
};

/**
 * Whether a turn's overrun can run at all: while the debate is still on, whatever follows the turn.
 * The next turn, the vote, a result or a required round's lead-in, and the thank-you with its final
 * board, all keep the speaker's last sentence (GEO-3407). The first speaker of a round always hands
 * straight to the second, but the second ends into one of the others, and an overrun that stopped
 * at them cut the second speaker off at the end of every round. Past the debate (complete,
 * cancelled) there is nothing to finish into. `useTurnOverrun` asks it for both ends of the overrun,
 * and `shouldEnableLocalAudio` for the overrun itself.
 */
export function turnOverrunPossible({ effectiveStatus }: Pick<LocalAudioGateInput, 'effectiveStatus'>): boolean {
  return effectiveStatus === 'in_progress' || effectiveStatus === 'thanking';
}

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
  openRoundsPhase,
  openRoundResultHeld,
}: LocalAudioGateInput): boolean {
  if (audioMuted || !effectiveStatus || !localSlot) return false;
  // Past the buzzer: hold only while they are genuinely still talking, and never past the cap.
  // Someone who stopped on time keeps the clean cut they always had — no dead air is added. Checked
  // before the phases that close both mics, which a sentence running over carries into (GEO-3407).
  if (
    turnOverrunPossible({ effectiveStatus }) &&
    stillSpeaking &&
    msSinceTurnEnded !== null &&
    msSinceTurnEnded < MIC_OVERRUN_MAX_MS
  ) {
    return true;
  }
  if (openRoundResultHeld) return false;
  // The intro is an open two-way call; turn-taking starts with the debate. Load-bearing: the turn
  // rule below would otherwise disable the published microphone track and the mic meter with it.
  if (effectiveStatus === 'ready') return true;
  if (effectiveStatus === 'thanking') return true;
  if (effectiveStatus !== 'in_progress') return false;

  if (openRoundsPhase === 'deciding') return true;
  if (openRoundsPhase === 'result') return false;
  if (activeSlot === localSlot) return true;
  if (msUntilTurnStarts !== null && msUntilTurnStarts <= MIC_PREARM_BEFORE_TURN_MS) return true;
  return false;
}

/**
 * How long the local mic is sure to stay closed (`0` while live): until the prearm before the room
 * clock's next boundary. Unschedulable openings (unmute, early yield) cut uploads short (GEO-3410).
 */
export function msLocalAudioStaysClosed(input: LocalAudioGateInput, msUntilPhaseEnds: number): number {
  if (shouldEnableLocalAudio(input)) return 0;
  const opensAtMs = Math.min(msUntilPhaseEnds, input.msUntilTurnStarts ?? Infinity);
  return Math.max(0, opensAtMs - MIC_PREARM_BEFORE_TURN_MS);
}
