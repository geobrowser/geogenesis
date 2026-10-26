import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpeechActivity } from './use-speech-activity';

// Loud enough to open the speech gate: a constant 0.5 is about -6 dBFS.
let level = 0.5;

beforeEach(() => {
  level = 0.5;
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] });
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(readonly tracks: MediaStreamTrack[] = []) {}
    }
  );
  vi.stubGlobal(
    'AudioContext',
    class {
      close() {
        return Promise.resolve();
      }

      createMediaStreamSource() {
        return { connect: () => undefined };
      }

      createAnalyser() {
        return { fftSize: 256, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(level) };
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const trackA = { id: 'a' } as MediaStreamTrack;
const trackB = { id: 'b' } as MediaStreamTrack;

describe('useSpeechActivity', () => {
  it('reports the gate opening and closing', () => {
    const onChange = vi.fn();
    const view = renderHook(() => useSpeechActivity(trackA, true, onChange));
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(view.result.current.current).toBe(true);

    level = 0;
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('does not report a sentence ending when the track is swapped or listening stops (GEO-3407)', () => {
    const onChange = vi.fn();
    const view = renderHook(({ track, enabled }) => useSpeechActivity(track, enabled, onChange), {
      initialProps: { track: trackA, enabled: true },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);

    // A processor attaching or a device change: the speaker is still mid-sentence.
    view.rerender({ track: trackB, enabled: true });
    view.rerender({ track: trackB, enabled: false });
    expect(onChange).not.toHaveBeenCalledWith(false);
    expect(view.result.current.current).toBe(false);
  });
});
