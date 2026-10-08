import { describe, expect, it } from 'vitest';

import type { AuthAttempt, AuthAttemptOutcome } from './auth-attempt';
import { isSaveVotesSignIn } from './save-votes-analytics';

const attempt = (outcome?: AuthAttemptOutcome, auth_intent = 'save_votes'): AuthAttempt => ({
  id: 'attempt',
  startedAt: Date.now(),
  outcome,
  properties: { auth_intent },
});

describe('isSaveVotesSignIn', () => {
  it('is a save while open or once signed in', () => {
    expect([undefined, 'signed_up', 'signed_in'].map(o => isSaveVotesSignIn(attempt(o as AuthAttemptOutcome)))).toEqual(
      [true, true, true]
    );
  });

  // GEO-3243: leaving after Privy signed someone in is followed by a sign-out; it is not a save.
  it('is not a save once the visitor left it, however they left', () => {
    const left = ['closed', 'superseded', 'left_after_sign_up', 'left_after_sign_in'] as const;
    expect(left.map(o => isSaveVotesSignIn(attempt(o)))).toEqual([false, false, false, false]);
  });

  it('is not a save when another prompt started it', () => {
    expect(isSaveVotesSignIn(attempt('signed_up', 'vote'))).toBe(false);
  });
});
