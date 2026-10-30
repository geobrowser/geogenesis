import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AuthAttempt, type AuthAttemptOutcome, authProperties } from './auth-attempt';
import { captureSaveVotesImpression, saveVotesSignIn, saveVotesSignInProperties } from './save-votes-analytics';

const capture = vi.hoisted(() => vi.fn());
vi.mock('./analytics', () => ({ capture }));
beforeEach(() => capture.mockReset());

describe('captureSaveVotesImpression', () => {
  it('records the first feed ask with one local vote using the existing impression event', () => {
    captureSaveVotesImpression('threshold', 1);

    expect(capture).toHaveBeenCalledOnce();
    expect(capture).toHaveBeenCalledWith(
      'component_impression',
      expect.objectContaining({
        component: 'save_votes_prompt',
        prompt_reason: 'threshold',
        local_vote_count: 1,
        presentation_instance_id: expect.any(String),
      })
    );
  });
});

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

  it('is not a save once the visitor closed it before signing in', () => {
    expect(saveVotesSignIn(attempt('closed'))).toBe('not_save');
    expect(saveVotesSignIn(attempt('superseded'))).toBe('not_save');
  });

  // Copilot on #2791 (round 2): leaving after Privy signed someone in is followed by a sign-out, and
  // the votes are the visitor's to save next time — not somebody else's to clear.
  it('is abandoned, not somebody else’s, once the visitor left after signing in', () => {
    expect(saveVotesSignIn(attempt('left_after_sign_up'))).toBe('abandoned');
    expect(saveVotesSignIn(attempt('left_after_sign_in'))).toBe('abandoned');
  });

  it('is not a save when another prompt started it, and leaves another tab’s sign-in to that tab', () => {
    expect(saveVotesSignIn(attempt('signed_up', 'vote'))).toBe('not_save');
    expect(saveVotesSignIn(undefined)).toBe('elsewhere');
  });
});

// Copilot on #2933: the auth events keep only allowlisted properties, and dropped this one.
describe('saveVotesSignInProperties', () => {
  it('keeps why the sheet was open through to the auth events', () => {
    expect(authProperties(saveVotesSignInProperties('email', 2, 'navbar'))).toMatchObject({
      auth_intent: 'save_votes',
      local_vote_count: 2,
      prompt_reason: 'navbar',
    });
  });
});
