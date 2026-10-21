'use client';

import * as React from 'react';

import type { Debate, ParticipantSlot } from './api';
import { MIC_OVERRUN_MAX_MS } from './local-audio-gate';
import { useSpeechActivity } from './use-speech-activity';

/**
 * How long past the listener's own buzzer the opponent can still be heard finishing.
 *
 * The speaker's microphone stays open for at most `MIC_OVERRUN_MAX_MS` past *their* buzzer. Each
 * room keeps its own clock against the server, so the two buzzers can land a little apart, and the
 * audio is on the network for a moment longer still. The slack covers that; the overrun still ends
 * the moment they go quiet, so it never adds a visible delay.
 */
export const REMOTE_OVERRUN_WINDOW_MS = MIC_OVERRUN_MAX_MS + 1_500;

/**
 * The opponent's side of `useTurnOverrun`, from this room's countdown: whether they hold the turn,
 * and whether it is ending because they pressed End turn. A yielded turn goes to `activeSlot: null`
 * with `yieldingSlot` set, the moment the yield reaches this room. Their microphone closed when they
 * pressed it, so whatever is still arriving then is the tail of a word they chose to cut, not an
 * overrun (GEO-3407).
 */
export function opponentTurnState({
  effectiveStatus,
  activeSlot,
  yieldingSlot,
  localSlot,
}: {
  effectiveStatus: Debate['status'] | null;
  activeSlot: ParticipantSlot | null;
  yieldingSlot: ParticipantSlot | null;
  localSlot: ParticipantSlot | null;
}): { turnActive: boolean; yielded: boolean } {
  if (localSlot === null) return { turnActive: false, yielded: false };
  return {
    turnActive: effectiveStatus === 'in_progress' && activeSlot !== null && activeSlot !== localSlot,
    yielded: yieldingSlot !== null && yieldingSlot !== localSlot,
  };
}

/**
 * When a speaker's turn ended (`Date.now()`) while they were still talking, for as long as they go
 * on talking past it, up to `windowMs`. Null otherwise.
 *
 * One rule for both ends of the overrun (GEO-2915, GEO-3407):
 * - The speaker's own room reads their microphone. This is what holds their published track open
 *   past the buzzer, through `shouldEnableLocalAudio`.
 * - The listener's room reads the opponent's incoming audio, so their tile shows them finishing for
 *   exactly as long as they can be heard, clock skew and network delay included.
 *
 * Ends on the speech gate's own change rather than at the next render, so the microphone closes as
 * the sentence does. Latched off: once they fall silent, a breath or a cough cannot reopen it until
 * their next turn. Someone who was not talking at the buzzer, or who ended their turn themselves,
 * gets the clean cut they always had.
 */
export function useTurnOverrun({
  track,
  listening,
  turnActive,
  overrunPossible,
  yielded = false,
  startsLate = false,
  windowMs,
}: {
  /** The speaker's audio: their own microphone, or their incoming track. */
  track: MediaStreamTrack | null;
  listening: boolean;
  /** The speaker holds the turn right now. */
  turnActive: boolean;
  /** What follows the turn can carry an overrun at all; see `turnOverrunPossible`. */
  overrunPossible: boolean;
  /** They ended the turn themselves, so there is nothing to rescue. */
  yielded?: boolean;
  /**
   * The opponent's audio reaches the listener after their own buzzer: on the network, and later
   * still when the speaker's clock runs behind. So speech that arrives within the window starts the
   * overrun too, timed from the buzzer. Never for our own microphone, where silence at the buzzer
   * is the clean cut and a sound after it must not reopen anything.
   */
  startsLate?: boolean;
  windowMs: number;
}): number | null {
  const [since, setSince] = React.useState<number | null>(null);
  // Read through refs: the speech gate flips several times a second for the whole debate, and only
  // the flip that ends a running overrun matters. A yield must suppress the overrun, but must not be
  // a dependency of the effect below, which fires on the turn changing and nothing else.
  // `waiting`: the turn ended in silence, but speech may yet arrive (`startsLate` only).
  const phaseRef = React.useRef<'idle' | 'waiting' | 'running'>('idle');
  const endedAtRef = React.useRef(0);
  const yieldedRef = React.useRef(yielded);
  yieldedRef.current = yielded;
  // The cap is held in a ref rather than returned from the turn effect's cleanup: that effect re-runs
  // on any input change, and a re-run mid-overrun would otherwise clear the cap without re-arming
  // it, leaving a noisy room to hold the microphone open, and recorded, past the window. Only the
  // overrun ending (or unmounting) clears it.
  const capTimerRef = React.useRef<number | null>(null);
  const stop = React.useCallback(() => {
    phaseRef.current = 'idle';
    if (capTimerRef.current !== null) window.clearTimeout(capTimerRef.current);
    capTimerRef.current = null;
    setSince(null);
  }, []);
  React.useEffect(
    () => () => {
      if (capTimerRef.current !== null) window.clearTimeout(capTimerRef.current);
      capTimerRef.current = null;
    },
    []
  );

  const speakingRef = useSpeechActivity(track, listening, speaking => {
    if (speaking && phaseRef.current === 'waiting') {
      phaseRef.current = 'running';
      setSince(endedAtRef.current);
    } else if (!speaking && phaseRef.current === 'running') {
      stop();
    }
  });

  // The speech reading goes quiet without reporting it when listening stops, so a running overrun is
  // ended here: a room that is no longer connected has nothing to hold open or show (GEO-3407).
  React.useEffect(() => {
    if (!listening) stop();
  }, [listening, stop]);

  const wasActiveRef = React.useRef(false);
  React.useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = turnActive;
    if (!wasActive || turnActive || !overrunPossible || yieldedRef.current) {
      if (turnActive || !overrunPossible) stop();
      return;
    }
    endedAtRef.current = Date.now();
    if (speakingRef.current) {
      phaseRef.current = 'running';
      setSince(endedAtRef.current);
    } else if (startsLate) {
      phaseRef.current = 'waiting';
    } else {
      return;
    }
    if (capTimerRef.current !== null) window.clearTimeout(capTimerRef.current);
    capTimerRef.current = window.setTimeout(stop, windowMs);
  }, [overrunPossible, speakingRef, startsLate, stop, turnActive, windowMs]);

  return since;
}
