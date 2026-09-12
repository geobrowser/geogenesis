import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AnsweredState, useCollapseAnswered } from './collapse-answered';

type Row = { id: string; state: AnsweredState };

const HOLD = 1_000;

function row(id: string, state: AnsweredState): Row {
  return { id, state };
}

function render(initial: Row[], enabled = true) {
  return renderHook(
    ({ rows }: { rows: Row[] }) =>
      useCollapseAnswered(rows, {
        keyOf: candidate => candidate.id,
        answeredStateOf: candidate => candidate.state,
        enabled,
        holdMs: HOLD,
      }),
    { initialProps: { rows: initial } }
  );
}

const ids = (rows: Row[]) => rows.map(candidate => candidate.id);

describe('useCollapseAnswered', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The whole point of the feature: a viewer who has answered a hundred claims should not scroll
  // past their own answers to reach anything new.
  it('drops rows that arrive already answered', () => {
    const { result } = render([row('a', 'answered'), row('b', 'unanswered')]);

    expect(ids(result.current)).toEqual(['b']);
  });

  // And drops them on the very first render, so nothing flashes in and folds back out.
  it('never shows them, not even for a frame', () => {
    const { result } = render([row('a', 'answered')]);

    expect(result.current).toEqual([]);
    act(() => void vi.advanceTimersByTime(HOLD * 2));
    expect(result.current).toEqual([]);
  });

  /**
   * `unknown` is the state this exists for. The viewer's side rides on a separate query, and until
   * it answers "holds no position" and "not asked yet" are the same `null` — so a row read the wrong
   * way here folds away underneath someone before anyone knew whether they had answered it.
   */
  it('keeps a row whose side is not known yet', () => {
    const { result } = render([row('a', 'unknown')]);

    expect(ids(result.current)).toEqual(['a']);
    act(() => void vi.advanceTimersByTime(HOLD * 2));
    expect(ids(result.current)).toEqual(['a']);
  });

  it('drops it once that lookup says the viewer had answered all along', () => {
    const { result, rerender } = render([row('a', 'unknown')]);
    expect(ids(result.current)).toEqual(['a']);

    rerender({ rows: [row('a', 'answered')] });

    // Straight away: it was never on screen as *unanswered*, so nothing about it has changed for
    // the viewer and there is nothing to animate.
    expect(result.current).toEqual([]);
  });

  describe('a row answered while the viewer is reading it', () => {
    it('stays long enough for the press to land, then folds', () => {
      const { result, rerender } = render([row('a', 'unanswered'), row('b', 'unanswered')]);
      expect(ids(result.current)).toEqual(['a', 'b']);

      rerender({ rows: [row('a', 'answered'), row('b', 'unanswered')] });

      expect(ids(result.current)).toEqual(['a', 'b']);
      act(() => void vi.advanceTimersByTime(HOLD - 1));
      expect(ids(result.current)).toEqual(['a', 'b']);

      act(() => void vi.advanceTimersByTime(1));
      expect(ids(result.current)).toEqual(['b']);
    });

    it('stays gone once the hold is up, through any number of refetches', () => {
      const { result, rerender } = render([row('a', 'unanswered')]);
      rerender({ rows: [row('a', 'answered')] });
      act(() => void vi.advanceTimersByTime(HOLD));
      expect(result.current).toEqual([]);

      rerender({ rows: [row('a', 'answered')] });

      expect(result.current).toEqual([]);
    });

    // Answering, clearing, and answering again is two folds rather than one — the record of having
    // folded is cleared by the answer that undid it.
    it('folds again if the viewer clears the answer and gives another', () => {
      const { result, rerender } = render([row('a', 'unanswered')]);
      rerender({ rows: [row('a', 'answered')] });
      act(() => void vi.advanceTimersByTime(HOLD));
      expect(result.current).toEqual([]);

      rerender({ rows: [row('a', 'unanswered')] });
      expect(ids(result.current)).toEqual(['a']);

      rerender({ rows: [row('a', 'answered')] });
      expect(ids(result.current)).toEqual(['a']);
      act(() => void vi.advanceTimersByTime(HOLD));
      expect(result.current).toEqual([]);
    });
  });

  // A list that is *about* the viewer's positions collapses to nothing, which is not a filter but a
  // broken tab.
  it('does nothing at all when it is off', () => {
    const { result } = render([row('a', 'answered'), row('b', 'unanswered')], false);

    expect(ids(result.current)).toEqual(['a', 'b']);
  });
});
