import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOTE_OVERRUN_WINDOW_MS, useTurnOverrun } from './turn-overrun';

const speech = vi.hoisted(() => ({
  ref: { current: false },
  onChange: undefined as ((speaking: boolean) => void) | undefined,
}));

vi.mock('./use-speech-activity', () => ({
  useSpeechActivity: (_track: unknown, _enabled: boolean, onChange?: (speaking: boolean) => void) => {
    speech.onChange = onChange;
    return speech.ref;
  },
}));

const track = {} as MediaStreamTrack;

function setSpeaking(speaking: boolean) {
  act(() => {
    speech.ref.current = speaking;
    speech.onChange?.(speaking);
  });
}

type Props = { turnActive: boolean; overrunPossible?: boolean; yielded?: boolean; startsLate?: boolean };

function renderOverrun(initial: Props) {
  return renderHook(
    ({ turnActive, overrunPossible = true, yielded = false, startsLate = false }: Props) =>
      useTurnOverrun({
        track,
        listening: true,
        turnActive,
        overrunPossible,
        yielded,
        startsLate,
        windowMs: REMOTE_OVERRUN_WINDOW_MS,
      }),
    { initialProps: initial }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-20T12:00:00.000Z'));
  speech.ref.current = false;
  speech.onChange = undefined;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTurnOverrun', () => {
  it('runs from the buzzer until they fall silent, then never again that turn', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);

    view.rerender({ turnActive: false });
    expect(view.result.current).toBe(Date.parse('2026-10-20T12:00:00.000Z'));

    setSpeaking(false);
    expect(view.result.current).toBeNull();

    // A cough after they finished: their mic is closed, and so is the tile.
    setSpeaking(true);
    expect(view.result.current).toBeNull();
  });

  it('keeps the clean cut when they had already stopped at the buzzer', () => {
    const view = renderOverrun({ turnActive: true });
    view.rerender({ turnActive: false });
    expect(view.result.current).toBeNull();
  });

  it('ends at its window however long they keep talking', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false });

    act(() => vi.advanceTimersByTime(REMOTE_OVERRUN_WINDOW_MS - 1));
    expect(view.result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toBeNull();
  });

  it('does not show an overrun where none can happen, or past the start of their next turn', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false, overrunPossible: false });
    expect(view.result.current).toBeNull();

    view.rerender({ turnActive: true });
    view.rerender({ turnActive: false });
    expect(view.result.current).not.toBeNull();
    view.rerender({ turnActive: false, overrunPossible: false });
    expect(view.result.current).toBeNull();

    view.rerender({ turnActive: true });
    view.rerender({ turnActive: false });
    expect(view.result.current).not.toBeNull();
    view.rerender({ turnActive: true });
    expect(view.result.current).toBeNull();
  });

  it('gives a speaker who ended their own turn the clean cut', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: true, yielded: true });
    view.rerender({ turnActive: false, yielded: true });
    expect(view.result.current).toBeNull();
  });

  describe('the opponent, heard over the network (startsLate)', () => {
    it('shows them finishing when their speech reaches us after our buzzer', () => {
      const view = renderOverrun({ turnActive: true, startsLate: true });
      view.rerender({ turnActive: false, startsLate: true });
      expect(view.result.current).toBeNull();

      act(() => vi.advanceTimersByTime(400));
      setSpeaking(true);
      // Drains from our buzzer, not from when the audio arrived.
      expect(view.result.current).toBe(Date.parse('2026-10-20T12:00:00.000Z'));

      setSpeaking(false);
      expect(view.result.current).toBeNull();
      setSpeaking(true);
      expect(view.result.current).toBeNull();
    });

    it('waits no longer than the window for late speech', () => {
      const view = renderOverrun({ turnActive: true, startsLate: true });
      view.rerender({ turnActive: false, startsLate: true });
      act(() => vi.advanceTimersByTime(REMOTE_OVERRUN_WINDOW_MS));
      setSpeaking(true);
      expect(view.result.current).toBeNull();
    });

    it('never waits on a speaker who ended their own turn', () => {
      const view = renderOverrun({ turnActive: true, startsLate: true });
      view.rerender({ turnActive: true, yielded: true, startsLate: true });
      view.rerender({ turnActive: false, yielded: true, startsLate: true });
      setSpeaking(true);
      expect(view.result.current).toBeNull();
    });
  });

  it('keeps our own microphone to the clean cut when we were silent at the buzzer', () => {
    const view = renderOverrun({ turnActive: true });
    view.rerender({ turnActive: false });
    setSpeaking(true);
    expect(view.result.current).toBeNull();
  });
});
