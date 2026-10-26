import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GATE_CLOSE_DELAY_MS } from './speech-activity';
import { OVERRUN_PAUSE_HOLD_MS, REMOTE_OVERRUN_WINDOW_MS, opponentTurnState, useTurnOverrun } from './turn-overrun';

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

// The gate reports a pause `GATE_CLOSE_DELAY_MS` after it began, so the hold has this much left.
const HOLD_AFTER_GATE_CLOSES_MS = OVERRUN_PAUSE_HOLD_MS - GATE_CLOSE_DELAY_MS;

function setSpeaking(speaking: boolean) {
  act(() => {
    speech.ref.current = speaking;
    speech.onChange?.(speaking);
  });
}

type Props = {
  turnActive: boolean;
  overrunPossible?: boolean;
  yielded?: boolean;
  startsLate?: boolean;
  listening?: boolean;
  windowMs?: number;
};

function renderOverrun(initial: Props) {
  return renderHook(
    ({
      turnActive,
      overrunPossible = true,
      yielded = false,
      startsLate = false,
      listening = true,
      windowMs = REMOTE_OVERRUN_WINDOW_MS,
    }: Props) =>
      useTurnOverrun({
        track,
        listening,
        turnActive,
        overrunPossible,
        yielded,
        startsLate,
        windowMs,
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
  it('runs from the buzzer until they have paused for the hold, then never again that turn', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);

    view.rerender({ turnActive: false });
    expect(view.result.current).toBe(Date.parse('2026-10-20T12:00:00.000Z'));

    setSpeaking(false);
    act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS - 1));
    expect(view.result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toBeNull();

    // A cough after they finished: their mic is closed, and so is the tile.
    setSpeaking(true);
    expect(view.result.current).toBeNull();
  });

  it('holds through a breath between phrases past the buzzer (GEO-3470)', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false });

    setSpeaking(false);
    act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS - 100));
    setSpeaking(true);
    // Speech resuming cancels the hold: it does not fire on the old pause.
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.result.current).toBe(Date.parse('2026-10-20T12:00:00.000Z'));

    setSpeaking(false);
    act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS));
    expect(view.result.current).toBeNull();
  });

  it('runs for someone pausing at the buzzer who spoke within the hold before it (GEO-3470)', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    setSpeaking(false);
    // 400 ms of pause behind the gate's own close delay when the buzzer goes.
    act(() => vi.advanceTimersByTime(400));
    const buzzer = Date.now();
    view.rerender({ turnActive: false });
    expect(view.result.current).toBe(buzzer);

    // They pick the sentence back up.
    act(() => vi.advanceTimersByTime(150));
    setSpeaking(true);
    act(() => vi.advanceTimersByTime(1_000));
    expect(view.result.current).toBe(buzzer);
  });

  it('closes a pause that began before the buzzer at the hold, timed from their last sound', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    setSpeaking(false);
    act(() => vi.advanceTimersByTime(400));
    view.rerender({ turnActive: false });
    act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS - 400 - 1));
    expect(view.result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current).toBeNull();
  });

  it('keeps the clean cut when their last sound was longer than the hold before the buzzer', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    setSpeaking(false);
    act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS));
    view.rerender({ turnActive: false });
    expect(view.result.current).toBeNull();
  });

  it('ends at its window however often they pause and pick up again', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false });

    for (let elapsed = 0; elapsed < REMOTE_OVERRUN_WINDOW_MS - 1_000; elapsed += 1_000) {
      setSpeaking(false);
      act(() => vi.advanceTimersByTime(500));
      setSpeaking(true);
      act(() => vi.advanceTimersByTime(500));
    }
    expect(view.result.current).not.toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
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
      act(() => vi.advanceTimersByTime(HOLD_AFTER_GATE_CLOSES_MS));
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

  it('keeps its cap through a re-render that changes its inputs mid-overrun', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false });
    expect(view.result.current).not.toBeNull();

    // Any input change re-runs the turn effect while they are still talking. The cap must survive
    // it, or a noisy room holds the microphone open, and recorded, past the window.
    act(() => vi.advanceTimersByTime(1_000));
    view.rerender({ turnActive: false, windowMs: REMOTE_OVERRUN_WINDOW_MS + 10_000 });
    view.rerender({ turnActive: false, startsLate: true });
    act(() => vi.advanceTimersByTime(REMOTE_OVERRUN_WINDOW_MS - 1_000));
    expect(view.result.current).toBeNull();
  });

  it('ends a running overrun when listening stops, which the speech reading no longer reports', () => {
    const view = renderOverrun({ turnActive: true });
    setSpeaking(true);
    view.rerender({ turnActive: false });
    expect(view.result.current).not.toBeNull();

    view.rerender({ turnActive: false, listening: false });
    expect(view.result.current).toBeNull();
  });

  it('keeps our own microphone to the clean cut when we were silent at the buzzer', () => {
    const view = renderOverrun({ turnActive: true });
    view.rerender({ turnActive: false });
    setSpeaking(true);
    expect(view.result.current).toBeNull();
  });
});

describe('opponentTurnState', () => {
  const state = (overrides: Partial<Parameters<typeof opponentTurnState>[0]>) =>
    opponentTurnState({
      effectiveStatus: 'in_progress',
      activeSlot: 2,
      yieldingSlot: null,
      localSlot: 1,
      ...overrides,
    });

  it('follows the opponent holding the turn', () => {
    expect(state({})).toEqual({ turnActive: true, yielded: false });
    expect(state({ activeSlot: 1 })).toEqual({ turnActive: false, yielded: false });
    expect(state({ activeSlot: null })).toEqual({ turnActive: false, yielded: false });
    expect(state({ effectiveStatus: 'thanking' })).toEqual({ turnActive: false, yielded: false });
  });

  it('marks a turn the opponent ended themselves, so the tail of their last word is not an overrun', () => {
    expect(state({ activeSlot: null, yieldingSlot: 2 })).toEqual({ turnActive: false, yielded: true });
    // Our own End turn is not theirs.
    expect(state({ activeSlot: null, yieldingSlot: 1 })).toEqual({ turnActive: false, yielded: false });
  });
});
