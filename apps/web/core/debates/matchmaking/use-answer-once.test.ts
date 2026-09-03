import { renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useAnswerOnce } from './use-answer-once';

describe('useAnswerOnce', () => {
  // `isPending` only disables a control on the next render, so both taps of a double tap run
  // against a still-enabled button. The second answer would 409 over the first.
  it('runs the first answer and swallows the rest', () => {
    const answer = vi.fn();
    const { result } = renderHook(() => useAnswerOnce());

    result.current.answerOnce(answer);
    result.current.answerOnce(answer);
    result.current.answerOnce(answer);

    expect(answer).toHaveBeenCalledTimes(1);
  });

  // Each press is its own answer, so the guard must not be per-callback.
  it('guards across different answers, not just repeats of one', () => {
    const accept = vi.fn();
    const dismiss = vi.fn();
    const { result } = renderHook(() => useAnswerOnce());

    result.current.answerOnce(accept);
    result.current.answerOnce(dismiss);

    expect(accept).toHaveBeenCalledOnce();
    expect(dismiss).not.toHaveBeenCalled();
  });

  // Without this the surface is answerable exactly once ever: the controls re-enable after a
  // failure, but the guard is still held and every press after it is swallowed.
  it('lets the next press land once a failed answer releases the guard', () => {
    const answer = vi.fn();
    const { result } = renderHook(() => useAnswerOnce());

    result.current.answerOnce(answer);
    result.current.releaseAnswer.onError();
    result.current.answerOnce(answer);

    expect(answer).toHaveBeenCalledTimes(2);
  });

  // The guard outlives a render: re-rendering between taps is the ordinary case, since answering
  // flips the mutation's `isPending`.
  it('holds the guard across re-renders', () => {
    const answer = vi.fn();
    const { result, rerender } = renderHook(() => useAnswerOnce());

    result.current.answerOnce(answer);
    rerender();
    result.current.answerOnce(answer);

    expect(answer).toHaveBeenCalledTimes(1);
  });
});
