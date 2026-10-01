import { describe, expect, it, vi } from 'vitest';

import { privyConfig } from './privy';

vi.mock('@geogenesis/auth', () => ({ PrivyProvider: () => null }));

/**
 * Sign-ins that finish in the page they started on. A visitor's press before signing up — a vote, a
 * join, "I'm interested" — is queued in memory and replayed once their account exists. A method that
 * redirects away (any OAuth provider: google, apple, twitter, discord, github, …) reloads the page,
 * and the press is gone with no sign it ever happened.
 */
const SAME_DOCUMENT_LOGIN_METHODS = ['email', 'sms', 'wallet', 'passkey'];

describe('Privy login methods', () => {
  // Fails when a redirecting method is added, so whoever adds it sees that the pending-actions queue
  // has to survive the redirect first (move it to sessionStorage and rebuild handlers on return).
  it('only allows sign-ins that stay in the page, which the in-memory action queue relies on', () => {
    const methods = privyConfig.loginMethods ?? [];

    expect(methods.length).toBeGreaterThan(0);
    expect(methods.filter(method => !SAME_DOCUMENT_LOGIN_METHODS.includes(method))).toEqual([]);
  });
});
