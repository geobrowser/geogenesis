import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type OpenRoundsRoomMoments, useOpenRoundsRoomSounds } from './open-rounds-room-sounds';
import type { RoomSound } from './room-sound-effects';

const quiet: OpenRoundsRoomMoments = {
  countInSeconds: null,
  goTurn: null,
  wrapItUpTurn: null,
  endsSoonTurn: null,
  endedTurn: null,
  decidingRound: null,
  decidingSecondsLeft: null,
  flipping: null,
  result: null,
  sayThanks: false,
  remoteReady: false,
};

function setup() {
  const played: RoomSound[] = [];
  const play = (sound: RoomSound) => void played.push(sound);
  const hook = renderHook((moments: OpenRoundsRoomMoments) => useOpenRoundsRoomSounds(moments, play), {
    initialProps: quiet,
  });
  return { played, step: (moments: Partial<OpenRoundsRoomMoments>) => hook.rerender({ ...quiet, ...moments }) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useOpenRoundsRoomSounds', () => {
  it('is silent while nothing is happening', () => {
    const { played, step } = setup();
    step({});
    step({});
    expect(played).toEqual([]);
  });

  it('ticks the count-in once a second, building to the last tick, then rings Go once', () => {
    const { played, step } = setup();
    for (const seconds of [5, 5, 4, 3, 3, 2, 1]) step({ countInSeconds: seconds });
    step({ goTurn: 2 });
    step({ goTurn: 2 });
    expect(played).toEqual(['tickSoft', 'tockSoft', 'tick', 'tock', 'tickLast', 'go']);
  });

  it('sounds a moment again in the next turn, but not again across ticks of the same one', () => {
    const { played, step } = setup();
    step({ wrapItUpTurn: 1 });
    step({ wrapItUpTurn: 1 });
    step({});
    step({ wrapItUpTurn: 2 });
    expect(played).toEqual(['hurry', 'hurry']);
  });

  it('asks the question, then ticks only the last three seconds of the pick window', () => {
    const { played, step } = setup();
    for (const seconds of [10, 9, 4, 3, 3, 2, 1, 0]) step({ decidingRound: 0, decidingSecondsLeft: seconds });
    expect(played).toEqual(['question', 'pickTick', 'pickTick', 'pickTick']);
  });

  it('lands the top tile’s stamp first and the other a beat later, each by its pick', () => {
    vi.useFakeTimers();
    const { played, step } = setup();
    step({ flipping: { round: 0, first: 'end', second: null } });
    expect(played).toEqual(['stampEnd']);
    vi.advanceTimersByTime(280);
    expect(played).toEqual(['stampEnd', 'stampNone']);
  });

  it('plays each banner once: a new round, the wrap, the max', () => {
    const { played, step } = setup();
    step({ result: { kind: 'round', round: 2 } });
    step({ result: { kind: 'round', round: 2 } });
    step({});
    step({ result: { kind: 'wrap' } });
    step({ result: { kind: 'max' } });
    expect(played).toEqual(['roundUp', 'wrap', 'max']);
  });

  it('covers the turn ended, last call, thanks and the other debater being ready', () => {
    const { played, step } = setup();
    step({ endedTurn: 3 });
    step({ endsSoonTurn: 4 });
    step({ sayThanks: true });
    step({ sayThanks: true, remoteReady: true });
    expect(played).toEqual(['handoff', 'endsoon', 'thanks', 'ready']);
  });
});
