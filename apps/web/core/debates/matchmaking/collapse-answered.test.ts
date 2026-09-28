import { act, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AnsweredState, useCollapseAnswered } from './collapse-answered';

type Row = { id: string; state: AnsweredState };

const HOLD = 1_000;

function row(id: string, state: AnsweredState): Row {
  return { id, state };
}

function render(initial: Row[], enabled = true, holdMs: number | null = HOLD, resetKey?: string) {
  return renderHook(
    ({ rows, key, on = enabled }: { rows: Row[]; key?: string | undefined; on?: boolean }) =>
      useCollapseAnswered(rows, {
        keyOf: candidate => candidate.id,
        answeredStateOf: candidate => candidate.state,
        enabled: on,
        holdMs,
        resetKey: key,
      }),
    { initialProps: { rows: initial, key: resetKey } as { rows: Row[]; key?: string; on?: boolean } }
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
  /**
   * Clearing inside the hold has to take the pending fold with it.
   *
   * Changing your mind twice in a second is a real thing to do, and the second answer was inheriting
   * the first one's timer: the guard against starting two folds for one row reads "a timer is
   * already pending", which was still true of a fold the clear should have cancelled. So the row
   * folded on the *first* answer's clock — here, 200ms after the press instead of a full second,
   * and arbitrarily close to zero the later in the hold the viewer changes their mind.
   */
  it('gives a fresh hold to an answer that follows a clear made mid-fold', () => {
    const { result, rerender } = render([row('a', 'unanswered')]);
    rerender({ rows: [row('a', 'answered')] });

    act(() => void vi.advanceTimersByTime(HOLD - 200));
    rerender({ rows: [row('a', 'unanswered')] });
    rerender({ rows: [row('a', 'answered')] });

    // The first answer's fold would land here. This answer is 200ms old.
    act(() => void vi.advanceTimersByTime(200));
    expect(ids(result.current)).toEqual(['a']);

    act(() => void vi.advanceTimersByTime(HOLD - 200));
    expect(result.current).toEqual([]);
  });

  /**
   * The debate-again flow's half of the same switch.
   *
   * There, answering is the first half of an action rather than the end of one — the claim you just
   * took a side on is the one you are about to request a debate on — so the backlog goes and the
   * answer you just gave stays. Same rule, same hook, one value different.
   */
  describe('with an indefinite hold', () => {
    it('keeps a row answered under the viewer, however long they stay', () => {
      const { result, rerender } = render([row('a', 'unanswered')], true, null);

      rerender({ rows: [row('a', 'answered')] });
      act(() => void vi.advanceTimersByTime(HOLD * 60));

      expect(ids(result.current)).toEqual(['a']);
    });

    // The half that still has to go, or the switch does nothing for the viewer who asked for it.
    it('still drops the backlog they arrived with', () => {
      const { result } = render([row('a', 'answered'), row('b', 'unanswered')], true, null);

      expect(ids(result.current)).toEqual(['b']);
    });

    // A kept row is kept because the viewer acted on it, not because the hook stopped watching: take
    // the answer away and it is an ordinary unanswered row again.
    it('goes on tracking a row it is keeping', () => {
      const { result, rerender } = render([row('a', 'unanswered')], true, null);
      rerender({ rows: [row('a', 'answered')] });

      rerender({ rows: [row('a', 'unanswered')] });

      expect(ids(result.current)).toEqual(['a']);
    });
  });

  /**
   * The row must not blink out and back on the commit it is answered.
   *
   * `holding` is written by the effect, which is passive and so runs *after* the browser has
   * painted the commit that first saw the answer. For that frame the row was neither unanswered nor
   * held, and left the list — on a one-row list that is the empty state flashing up, and on the
   * debate-again flow it is the "Request debate" button blinking out from under the press that
   * earned it, with `AnimatePresence` starting an exit for a row that is about to come back.
   *
   * Every render is recorded rather than only the last, because the last one is already correct:
   * the effect has run by then, which is exactly why this was invisible.
   */
  it('keeps a row on the very commit it is answered, before the effect records the hold', () => {
    const drawn: string[][] = [];
    const { rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => {
        const visible = useCollapseAnswered(rows, {
          keyOf: candidate => candidate.id,
          answeredStateOf: candidate => candidate.state,
          enabled: true,
          holdMs: HOLD,
        });
        drawn.push(ids(visible));
        return visible;
      },
      { initialProps: { rows: [row('a', 'unanswered')] } }
    );

    drawn.length = 0;
    rerender({ rows: [row('a', 'answered')] });

    expect(drawn).not.toContainEqual([]);
  });

  /**
   * Bookkeeping is about one list. The debate-again flow reuses its page when the route moves
   * between rematches, so without a reset a claim seen unanswered opposite one opponent counted as
   * seen for the next — and was held on screen instead of hidden as the backlog it is for them.
   */
  describe('when the list it is describing is replaced', () => {
    it('forgets what it saw in the previous one', () => {
      const { result, rerender } = render([row('a', 'unanswered')], true, HOLD, 'session-1');
      rerender({ rows: [row('a', 'answered')], key: 'session-1' });
      expect(ids(result.current)).toEqual(['a']);

      rerender({ rows: [row('a', 'answered')], key: 'session-2' });

      expect(result.current).toEqual([]);
    });
  });

  /**
   * A paged list looks its rows up a page at a time, and the flag saying so is usually one flag for
   * the whole list. So every fetch of a later page turned every row already on screen back into
   * `unknown` — and a viewer's whole collapsed backlog reappeared until it settled, over and over as
   * they scrolled.
   */
  describe('while a later page is being looked up', () => {
    it('keeps a collapsed row collapsed', () => {
      const { result, rerender } = render([row('a', 'answered'), row('b', 'unanswered')]);
      expect(ids(result.current)).toEqual(['b']);

      // The next page's lookup starts, and the flag behind every row goes back to unknown.
      rerender({ rows: [row('a', 'unknown'), row('b', 'unknown'), row('c', 'unknown')] });

      expect(ids(result.current)).not.toContain('a');
    });

    it('holds back a row nobody has classified yet, rather than drawing one it may take away', () => {
      const { result, rerender } = renderHook(
        ({ rows, classifying }: { rows: Row[]; classifying: boolean }) =>
          useCollapseAnswered(rows, {
            keyOf: candidate => candidate.id,
            answeredStateOf: candidate => candidate.state,
            enabled: true,
            holdMs: HOLD,
            classifying,
          }),
        { initialProps: { rows: [row('a', 'unanswered')], classifying: false } }
      );

      rerender({ rows: [row('a', 'unanswered'), row('c', 'unknown')], classifying: true });
      expect(ids(result.current)).toEqual(['a']);

      // And draws it once its own answer lands.
      rerender({ rows: [row('a', 'unanswered'), row('c', 'unanswered')], classifying: false });
      expect(ids(result.current)).toEqual(['a', 'c']);
    });

    // The rule only covers rows it is *about* to classify. A lookup that settled without an answer
    // leaves them genuinely unknown, and a list that is too wide beats a list that never fills.
    it('draws an unclassifiable row once the lookup has finished', () => {
      const { result } = render([row('a', 'unknown')]);

      expect(ids(result.current)).toEqual(['a']);
    });
  });

  /**
   * Turning the filter off and on again starts the question over.
   *
   * Nothing is recorded while it is off, so a row seen unanswered before and answered *during*
   * came back still marked as seen — and on the debate-again flow "seen unanswered" means keep for
   * good. An enabled switch then failed to hide it, for the rest of the visit. What is on screen
   * when it comes back on is the backlog, whatever happened while nobody was watching.
   */
  it('treats what it finds on the way back on as the backlog', () => {
    const { result, rerender } = render([row('a', 'unanswered')], true, null);

    rerender({ rows: [row('a', 'unanswered')], on: false });
    rerender({ rows: [row('a', 'answered')], on: false });
    rerender({ rows: [row('a', 'answered')], on: true });

    expect(result.current).toEqual([]);
  });

  it('does nothing at all when it is off', () => {
    const { result } = render([row('a', 'answered'), row('b', 'unanswered')], false);

    expect(ids(result.current)).toEqual(['a', 'b']);
  });
});
