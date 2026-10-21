import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOTE_OVERRUN_WINDOW_MS, useRemoteTurnOverrun } from './remote-turn-overrun';

const speech = vi.hoisted(() => ({
  ref: { current: false },
  onChange: undefined as ((speaking: boolean) => void) | undefined,
}));

vi.mock('./use-local-speech-activity', () => ({
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

function renderOverrun(initial: { turnActive: boolean; overrunPossible?: boolean }) {
  return renderHook(
    ({ turnActive, overrunPossible = true }: { turnActive: boolean; overrunPossible?: boolean }) =>
      useRemoteTurnOverrun({ audioTrack: track, turnActive, overrunPossible }),
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

describe('useRemoteTurnOverrun', () => {
  it('shows the opponent finishing from the buzzer until they fall silent, then never again that turn', () => {
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

  it('gives up once even a skewed overrun must have ended', () => {
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
});
