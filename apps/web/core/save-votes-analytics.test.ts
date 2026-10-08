import { describe, expect, it } from 'vitest';

import type { AuthAttempt, AuthAttemptOutcome } from './auth-attempt';
import { saveVotesSignIn } from './save-votes-analytics';

const attempt = (outcome?: AuthAttemptOutcome, auth_intent = 'save_votes'): AuthAttempt => ({
  id: 'attempt',
  startedAt: Date.now(),
  outcome,
  properties: { auth_intent },
});

describe('saveVotesSignIn', () => {
  it('saves once a save prompt’s sign-in has completed', () => {
    expect(saveVotesSignIn(attempt('signed_up'))).toBe('save');
    expect(saveVotesSignIn(attempt('signed_in'))).toBe('save');
  });

  // Copilot on #2791: Privy reports a user before its dialog is done, and the visitor can still back out.
  it('waits while the save prompt’s sign-in is still open', () => {
    expect(saveVotesSignIn(attempt())).toBe('pending');
  });

  // GEO-3243: leaving after Privy signed someone in is followed by a sign-out; it is not a save.
  it('is not a save once the visitor left it, however they left', () => {
    const left = ['closed', 'superseded', 'left_after_sign_up', 'left_after_sign_in'] as const;
    expect(left.map(o => saveVotesSignIn(attempt(o)))).toEqual(['not_save', 'not_save', 'not_save', 'not_save']);
  });

  it('is not a save when another prompt started it, and leaves another tab’s sign-in to that tab', () => {
    expect(saveVotesSignIn(attempt('signed_up', 'vote'))).toBe('not_save');
    expect(saveVotesSignIn(undefined)).toBe('elsewhere');
  });
});
