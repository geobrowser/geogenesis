'use client';

import * as React from 'react';

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
  windowMs: number;
}): number | null {
  const [since, setSince] = React.useState<number | null>(null);
  // Read through refs: the speech gate flips several times a second for the whole debate, and only
  // the flip that ends a running overrun matters. A yield must suppress the overrun, but must not be
  // a dependency of the effect below, which fires on the turn changing and nothing else.
  const overrunningRef = React.useRef(false);
  const yieldedRef = React.useRef(yielded);
  yieldedRef.current = yielded;
  const stop = React.useCallback(() => {
    overrunningRef.current = false;
    setSince(null);
  }, []);

  const speakingRef = useSpeechActivity(track, listening, speaking => {
    if (!speaking && overrunningRef.current) stop();
  });

  const wasActiveRef = React.useRef(false);
  React.useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = turnActive;
    if (!wasActive || turnActive || !overrunPossible || yieldedRef.current || !speakingRef.current) {
      if (turnActive || !overrunPossible) stop();
      return;
    }
    overrunningRef.current = true;
    setSince(Date.now());
    const timer = window.setTimeout(stop, windowMs);
    return () => window.clearTimeout(timer);
  }, [overrunPossible, speakingRef, stop, turnActive, windowMs]);

  return since;
}
