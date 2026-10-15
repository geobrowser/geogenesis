import * as React from 'react';

import type { OpenRoundPick } from './api';
import { BREAK_STAMP_GAP_MS } from './playback-breaks';
import { type RoomSound, countInSound, stampSound } from './room-sound-effects';

/**
 * Which of the room's moments are up right now, as the room already draws them (GEO-3319).
 *
 * Each field is a key rather than a flag: the sound plays once when it turns to a new non-null
 * value, so a moment that stays up across the room's 500 ms ticks sounds once, and the same moment
 * in the next turn or round (a new key) sounds again.
 */
export type OpenRoundsRoomMoments = {
  /** Seconds until the local debater's turn, while their count-in shows. */
  countInSeconds: number | null;
  /** The turn whose Go the local debater is seeing. */
  goTurn: number | null;
  /** The turn whose "Wrap it up" is showing, on either tile. */
  wrapItUpTurn: number | null;
  /** The turn whose "Debate ends soon" the listener is seeing. */
  endsSoonTurn: number | null;
  /** The turn someone ended early. */
  endedTurn: number | null;
  /** The round whose Extend/End card is up. */
  decidingRound: number | null;
  /** Whole seconds left to pick, while the card is up. */
  decidingSecondsLeft: number | null;
  /** The round whose picks are landing, top tile first. */
  flipping: { round: number; first: OpenRoundPick | null; second: OpenRoundPick | null } | null;
  /** The banner over both tiles: a new round, "That's a wrap" or "That's the max". */
  result: { kind: 'round'; round: number } | { kind: 'wrap' } | { kind: 'max' } | null;
};

/** The last three seconds of the pick window tick. */
const PICK_TICK_SECONDS = 3;

function useCue(key: string | number | null, cue: () => void) {
  const last = React.useRef<string | number | null>(null);
  React.useEffect(() => {
    if (key !== null && key !== last.current) cue();
    last.current = key;
  });
}

export function useOpenRoundsRoomSounds(moments: OpenRoundsRoomMoments, play: (sound: RoomSound) => void) {
  const { countInSeconds, decidingRound, decidingSecondsLeft, flipping, result } = moments;

  useCue(countInSeconds, () => countInSeconds !== null && play(countInSound(countInSeconds)));
  useCue(moments.goTurn, () => play('go'));
  useCue(moments.wrapItUpTurn, () => play('hurry'));
  useCue(moments.endsSoonTurn, () => play('endsoon'));
  useCue(moments.endedTurn, () => play('handoff'));
  useCue(decidingRound, () => play('question'));
  useCue(
    decidingRound !== null &&
      decidingSecondsLeft !== null &&
      decidingSecondsLeft > 0 &&
      decidingSecondsLeft <= PICK_TICK_SECONDS
      ? `${decidingRound}:${decidingSecondsLeft}`
      : null,
    () => play('pickTick')
  );
  useCue(flipping?.round ?? null, () => {
    if (!flipping) return;
    play(stampSound(flipping.first));
    // The second stamp lands as the room draws it, a beat after the first.
    window.setTimeout(() => play(stampSound(flipping.second)), BREAK_STAMP_GAP_MS);
  });
  useCue(result ? (result.kind === 'round' ? `round:${result.round}` : result.kind) : null, () => {
    if (result) play(result.kind === 'round' ? 'roundUp' : result.kind);
  });
}
