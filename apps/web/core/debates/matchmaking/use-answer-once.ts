'use client';

import * as React from 'react';

/**
 * One answer per request, however fast the taps land.
 *
 * `isPending` only disables a control on the *next* render, so a double tap gets two answers in
 * before it takes effect — and the second one 409s over a request the first already took.
 *
 * `releaseAnswer` gives the guard back when an answer fails. A surface that does not pass it stays
 * answerable only until its first failure: the controls re-enable, but every press after that is
 * swallowed. Pass it to each mutation rather than watching an error flag, so it fires on the
 * attempt that actually failed however many follow it.
 */
export function useAnswerOnce() {
  const answered = React.useRef(false);

  const answerOnce = (answer: () => void) => {
    if (answered.current) return;
    answered.current = true;
    answer();
  };

  return { answerOnce, releaseAnswer: { onError: () => void (answered.current = false) } };
}
