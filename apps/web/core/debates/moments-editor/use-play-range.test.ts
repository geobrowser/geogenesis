import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateFeedPlayerHandle } from '../browse/debate-feed-player';
import type { EditorClip } from './reel';
import { type PlaySegment, RANGE_STALL_MS, nextRangeStep, reelSegments, usePlayRange } from './use-play-range';

/**
 * A player whose position runs off the (fake) wall clock at its rate, as the real pair does. Jumps
 * land where they are sent; `outcome` says whether they were held under frames.
 */
function fakePlayer() {
  let base = 0;
  let at = Date.now();
  let running = false;
  let rate = 1;
  const position = () => (running ? base + (Date.now() - at) * rate : base);
  const rebase = () => {
    base = position();
    at = Date.now();
  };
  const state = {
    outcome: 'seeked' as 'held' | 'seeked',
    /** Runs inside `jumpTo`, before it returns: for transitions reported synchronously. */
    duringJump: null as null | (() => void),
  };
  /** Where the player was each time the range paused it. */
  const pausedAt: number[] = [];
  const handle = {
    play: vi.fn(),
    pause: vi.fn(() => {
      pausedAt.push(position());
      rebase();
      running = false;
    }),
    seek: vi.fn(),
    jumpTo: vi.fn((ms: number): 'held' | 'seeked' => {
      base = ms;
      at = Date.now();
      state.duringJump?.();
      return state.outcome;
    }),
    livePositionMs: vi.fn((): number | null => position()),
    unmute: vi.fn(),
  } satisfies DebateFeedPlayerHandle;
  return Object.assign(state, {
    pausedAt,
    handle,
    run(next: boolean) {
      rebase();
      running = next;
    },
    speed(next: number) {
      rebase();
      rate = next;
    },
  });
}

type Props = { rate: number; playing: boolean; failed: boolean; clipsKey: string };

function setup(initial: Partial<Props> = {}) {
  const player = fakePlayer();
  const onEnd = vi.fn();
  // One ref for the hook's life, as the editor's `useRef` is.
  const handle = { current: player.handle };
  let props: Props = { rate: 1, playing: false, failed: false, clipsKey: 'a,b', ...initial };
  player.run(props.playing);
  player.speed(props.rate);
  const hook = renderHook((current: Props) => usePlayRange({ handle, onEnd, ...current }), {
    initialProps: props,
  });
  const update = (next: Partial<Props>) => {
    props = { ...props, ...next };
    if (next.playing !== undefined) player.run(next.playing);
    if (next.rate !== undefined) player.speed(next.rate);
    hook.rerender(props);
  };
  return { ...hook, player, onEnd, update };
}

const clipA: PlaySegment = { key: 'a', start_ms: 10_000, end_ms: 20_000 };
const clipB: PlaySegment = { key: 'b', start_ms: 40_000, end_ms: 50_000 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('nextRangeStep', () => {
  it('waits for the end, then jumps to the next clip, or ends after the last', () => {
    expect(nextRangeStep([clipA, clipB], 0, 15_000)).toEqual({ kind: 'wait', remainingMs: 5_000 });
    expect(nextRangeStep([clipA, clipB], 0, 20_000)).toEqual({ kind: 'jump', index: 1, toMs: 40_000 });
    expect(nextRangeStep([clipA, clipB], 1, 50_500)).toEqual({ kind: 'end' });
  });

  it('plays straight on into a clip that starts under 150 ms away', () => {
    const touching = { key: 'b', start_ms: 20_100, end_ms: 30_000 };
    expect(nextRangeStep([clipA, touching], 0, 19_990)).toEqual({ kind: 'continue', index: 1 });
  });
});

describe('reelSegments', () => {
  const clip = (key: string, start_ms: number, end_ms: number) => ({ key, start_ms, end_ms }) as EditorClip;
  const clips = [clip('a', 1_000, 5_000), clip('b', 8_000, 12_000)];

  it('plays the played cuts and skips a clip without one', () => {
    expect(reelSegments(clips, [{ start_ms: 900, end_ms: 5_400 }, null], false)).toEqual([
      { key: 'a', start_ms: 900, end_ms: 5_400 },
    ]);
  });

  it("plays a carried reel's clip spans, since it has no played cuts", () => {
    expect(reelSegments(clips, [null, null], true)).toEqual([
      { key: 'a', start_ms: 1_000, end_ms: 5_000 },
      { key: 'b', start_ms: 8_000, end_ms: 12_000 },
    ]);
  });
});

describe('usePlayRange', () => {
  it('starts a paused pair inside the click, then moves it under the hold', () => {
    const { result, player } = setup({ playing: false });
    player.outcome = 'held';

    act(() => result.current.start('clip', [clipA]));

    expect(player.handle.play).toHaveBeenCalledOnce();
    expect(player.handle.jumpTo).toHaveBeenCalledWith(10_000);
    expect(player.handle.play.mock.invocationCallOrder[0]).toBeLessThan(
      player.handle.jumpTo.mock.invocationCallOrder[0]
    );
    expect(player.handle.seek).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ kind: 'playing', key: 'a', loading: true });
    expect(result.current.active).toBe(true);

    act(() => result.current.onTransition('release'));
    expect(result.current.state).toMatchObject({ kind: 'playing', loading: false });
  });

  it('stops at the end at 2x', () => {
    const { result, player, onEnd } = setup({ playing: true, rate: 2 });

    act(() => result.current.start('clip', [clipA]));
    act(() => vi.advanceTimersByTime(4_990));
    expect(player.handle.pause).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(20));

    expect(player.handle.pause).toHaveBeenCalledOnce();
    expect(Math.abs(player.pausedAt[0] - 20_000)).toBeLessThan(60);
    expect(onEnd).toHaveBeenCalledWith('clip');
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('stops within a frame of the end when the speed goes from 1x to 2x mid-clip', () => {
    const { result, player, update } = setup({ playing: true, rate: 1 });
    act(() => result.current.start('clip', [clipA]));
    act(() => vi.advanceTimersByTime(2_000));

    // 12 s in, 8 s of clip left: 4 s of wall time at 2x, not the 8 s the 1x timer was waiting.
    act(() => update({ rate: 2 }));
    act(() => vi.advanceTimersByTime(4_100));

    expect(player.handle.pause).toHaveBeenCalledOnce();
    expect(Math.abs(player.pausedAt[0] - 20_000)).toBeLessThan(60);
  });

  it('ends at once on a position past the end, with the timer never firing (a throttled tab)', () => {
    const { result, player } = setup({ playing: true });
    act(() => result.current.start('clip', [clipA]));

    act(() => result.current.onPlayhead(20_010));

    expect(player.handle.pause).toHaveBeenCalledOnce();
    expect(result.current.state).toEqual({ kind: 'idle' });
  });

  it('jumps to the next clip under the hold, loading until the hold releases', () => {
    const { result, player } = setup({ playing: true });
    player.outcome = 'held';
    act(() => result.current.start('reel', [clipA, clipB]));
    act(() => result.current.onTransition('release'));

    act(() => vi.advanceTimersByTime(10_000));

    expect(player.handle.jumpTo).toHaveBeenLastCalledWith(40_000);
    expect(player.handle.pause).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ kind: 'playing', key: 'b', index: 1, loading: true });

    act(() => result.current.onTransition('release'));
    expect(result.current.state).toMatchObject({ kind: 'playing', key: 'b', loading: false });
    act(() => vi.advanceTimersByTime(10_000));
    expect(player.handle.pause).toHaveBeenCalledOnce();
  });

  it('does not wait for a hold that never was: a plain seek is not loading', () => {
    const { result, player } = setup({ playing: true });
    act(() => result.current.start('reel', [clipA, clipB]));
    act(() => vi.advanceTimersByTime(10_000));

    expect(player.handle.jumpTo).toHaveBeenLastCalledWith(40_000);
    expect(result.current.state).toMatchObject({ kind: 'playing', index: 1, loading: false });
  });

  it('plays straight on into a clip that starts right where the last one ends', () => {
    const { result, player } = setup({ playing: true });
    act(() => result.current.start('reel', [clipA, { key: 'b', start_ms: 20_050, end_ms: 30_000 }]));
    act(() => vi.advanceTimersByTime(10_000));

    expect(player.handle.jumpTo).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({ kind: 'playing', key: 'b', index: 1 });
  });

  it('stalls when the hold is dropped, and Play resumes the clip where it stopped', () => {
    const { result, player, update } = setup({ playing: true });
    player.outcome = 'held';
    act(() => result.current.start('reel', [clipA, clipB]));
    act(() => result.current.onTransition('release'));
    act(() => vi.advanceTimersByTime(3_000));

    act(() => result.current.onTransition('start'));
    act(() => update({ playing: false }));
    // Not ours: a stop by the player is a stall, not an end.
    expect(result.current.state).toMatchObject({ kind: 'stalled', key: 'a' });

    act(() => result.current.retry());
    expect(player.handle.play).toHaveBeenCalledOnce();
    expect(player.handle.jumpTo).toHaveBeenLastCalledWith(13_000);
    expect(result.current.state).toMatchObject({ kind: 'playing', key: 'a', loading: true });

    act(() => result.current.onTransition('cancel'));
    expect(result.current.state).toMatchObject({ kind: 'stalled' });
  });

  it('ignores the cancel of the jump its own jump replaced, and takes a release reported at once', () => {
    const { result, player } = setup({ playing: true });
    player.outcome = 'held';
    player.duringJump = () => result.current.onTransition('cancel');
    act(() => result.current.start('clip', [clipA]));
    expect(result.current.state).toMatchObject({ kind: 'playing', loading: true });

    // A hidden tab releases the hold before `jumpTo` even returns.
    player.duringJump = () => {
      result.current.onTransition('start');
      result.current.onTransition('release');
    };
    act(() => result.current.start('clip', [clipA]));
    expect(result.current.state).toMatchObject({ kind: 'playing', loading: false });
  });

  it('stalls at once when the start it is waiting for fails or is refused', () => {
    const { result, update } = setup({ playing: false });
    act(() => result.current.start('clip', [clipA]));
    expect(result.current.state).toMatchObject({ kind: 'playing' });

    // Never playing, so no stop to notice: only the failure says so, well before the watchdog.
    act(() => update({ failed: true }));

    expect(result.current.state).toMatchObject({ kind: 'stalled' });
  });

  it('stalls when a start never comes, and carries on if it comes late', () => {
    const { result, update } = setup({ playing: false });
    act(() => result.current.start('clip', [clipA]));
    act(() => vi.advanceTimersByTime(RANGE_STALL_MS - 100));
    expect(result.current.state).toMatchObject({ kind: 'playing' });

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.state).toMatchObject({ kind: 'stalled' });

    act(() => update({ playing: true }));
    expect(result.current.state).toMatchObject({ kind: 'playing', loading: false });
  });

  it('ends, not stalls, when the debate itself ends where the last clip does', () => {
    const { result, onEnd, update } = setup({ playing: true });
    act(() => result.current.start('reel', [clipA]));
    // The player reaches the debate's end and stops a moment before the end timer would fire.
    act(() => vi.advanceTimersByTime(9_990));
    act(() => update({ playing: false }));

    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(onEnd).toHaveBeenCalledWith('reel');
  });

  it('still stalls on a stop short of the end', () => {
    const { result, update } = setup({ playing: true });
    act(() => result.current.start('reel', [clipA, clipB]));
    act(() => vi.advanceTimersByTime(9_990));
    act(() => update({ playing: false }));

    expect(result.current.state).toMatchObject({ kind: 'stalled', index: 0 });
  });

  it('stops, and pauses the player, when the clips change under it', () => {
    const { result, player, update } = setup({ playing: true, clipsKey: 'a,b' });
    act(() => result.current.start('reel', [clipA, clipB]));

    act(() => update({ clipsKey: 'b,a' }));

    expect(result.current.state).toEqual({ kind: 'idle' });
    expect(player.handle.pause).toHaveBeenCalledOnce();
    // The pause it made is not taken for a stall, and nothing fires later.
    act(() => update({ playing: false }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.state).toEqual({ kind: 'idle' });
  });
});
