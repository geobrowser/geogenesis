'use client';

import * as React from 'react';

import { MIC_OVERRUN_MAX_MS } from './local-audio-gate';
import { useSpeechActivity } from './use-local-speech-activity';

/**
 * How long past the listener's own buzzer the opponent can still be heard finishing.
 *
 * The speaker's microphone stays open for at most `MIC_OVERRUN_MAX_MS` past *their* buzzer. Each
 * room keeps its own clock against the server, so the two buzzers can land a little apart, and the
 * audio is on the network for a moment longer still. The slack covers that; the room still stops
 * showing the opponent as finishing the moment they go quiet, so it never adds a visible delay.
 */
export const REMOTE_OVERRUN_WINDOW_MS = MIC_OVERRUN_MAX_MS + 1_500;

/**
 * GEO-3407. When the opponent's turn ended while they were still talking, the time (`Date.now()`) it
 * ended, for as long as they can still be heard. Null otherwise.
 *
 * The opponent's tile used to switch to the muted microphone at the listener's own buzzer, while
 * the speaker's overrun (GEO-2915) kept them audible for up to several seconds more. This listens to
 * the opponent's incoming audio — what the listener actually hears — through the same speech gate
 * that decides when the speaker's own microphone closes. The two agree by construction: whatever
 * the cause of the delay, clock skew and network included, the tile shows them finishing exactly
 * as long as they can be heard.
 *
 * Latched off: once the opponent falls silent, or the window runs out, it stays off until their next
 * turn. The speaker's microphone does the same, so a cough after they finished is never shown as
 * talking.
 */
export function useRemoteTurnOverrun({
  audioTrack,
  turnActive,
  overrunPossible,
}: {
  /** The opponent's subscribed audio, as it reaches this listener. */
  audioTrack: MediaStreamTrack | null;
  /** The opponent holds the turn right now. */
  turnActive: boolean;
  /** The phase that follows can carry an overrun at all; see `shouldEnableLocalAudio`. */
  overrunPossible: boolean;
}): number | null {
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const watchingRef = React.useRef(false);
  const stop = React.useCallback(() => {
    watchingRef.current = false;
    setStartedAt(null);
  }, []);

  // Listened to for the whole debate, so the answer is already settled when the turn ends; only the
  // gate closing during an overrun costs a render.
  const speakingRef = useSpeechActivity(audioTrack, audioTrack !== null, speaking => {
    if (!speaking && watchingRef.current) stop();
  });

  const wasActiveRef = React.useRef(false);
  React.useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = turnActive;
    if (!wasActive || turnActive || !overrunPossible || !speakingRef.current) {
      if (turnActive || !overrunPossible) stop();
      return;
    }
    watchingRef.current = true;
    setStartedAt(Date.now());
    const timer = window.setTimeout(stop, REMOTE_OVERRUN_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [overrunPossible, speakingRef, stop, turnActive]);

  return startedAt;
}
