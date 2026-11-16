import { act, render, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DebateFeedPlayerHandle } from '../browse/debate-feed-player';
import { usePlayheadFrame, usePlayheadText } from './use-playhead-frame';

function handleAt(position: { ms: number }) {
  return {
    current: {
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      jumpTo: vi.fn(() => 'seeked' as const),
      livePositionMs: () => position.ms,
      endMs: () => null,
      unmute: vi.fn(),
    } satisfies DebateFeedPlayerHandle,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('usePlayheadFrame', () => {
  it('tells listeners the position every frame while playing, and stops when paused', () => {
    const position = { ms: 1_000 };
    const handle = handleAt(position);
    const heard: number[] = [];
    const { result, rerender } = renderHook(({ playing }) => usePlayheadFrame(handle, playing), {
      initialProps: { playing: true },
    });
    act(() => {
      result.current.subscribe(ms => heard.push(ms));
    });

    position.ms = 1_040;
    act(() => vi.advanceTimersByTime(20));
    position.ms = 1_080;
    act(() => vi.advanceTimersByTime(20));
    expect(heard).toEqual([1_000, 1_040, 1_080]);

    rerender({ playing: false });
    position.ms = 5_000;
    act(() => vi.advanceTimersByTime(200));
    expect(heard).toEqual([1_000, 1_040, 1_080]);

    // A seek while paused is read on request.
    act(() => result.current.refresh());
    expect(heard.at(-1)).toBe(5_000);
  });

  it('writes the readout without rendering the component that holds it', () => {
    const position = { ms: 61_900 };
    const handle = handleAt(position);
    let renders = 0;
    function Readout() {
      renders++;
      const frame = usePlayheadFrame(handle, true);
      const ref = usePlayheadText(frame, ms => `${(ms / 1000).toFixed(1)} s`);
      return <span data-testid="time" ref={ref} />;
    }
    const { getByTestId } = render(<Readout />);
    const rendersAfterMount = renders;

    for (let frame = 0; frame < 30; frame++) {
      position.ms += 33;
      act(() => vi.advanceTimersByTime(17));
    }

    expect(getByTestId('time').textContent).toBe(`${((61_900 + 30 * 33) / 1000).toFixed(1)} s`);
    expect(renders).toBe(rendersAfterMount);
  });
});
