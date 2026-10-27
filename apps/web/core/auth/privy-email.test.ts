import { describe, expect, it } from 'vitest';

import { privyUserEmail } from './privy-email';

describe('privyUserEmail', () => {
  it('reads the passwordless email account', () => {
    expect(privyUserEmail({ email: { address: ' Ada@Example.com ' } })).toBe('ada@example.com');
  });

  it('reads a Google-only user', () => {
    expect(privyUserEmail({ google: { email: 'g@example.com' } })).toBe('g@example.com');
    expect(
      privyUserEmail({
        linkedAccounts: [
          { type: 'wallet', address: '0xabc' },
          { type: 'google_oauth', email: 'G@Example.com' },
        ],
      })
    ).toBe('g@example.com');
  });

  it('prefers the email account over Google', () => {
    expect(privyUserEmail({ email: { address: 'a@example.com' }, google: { email: 'g@example.com' } })).toBe(
      'a@example.com'
    );
    expect(
      privyUserEmail({
        linkedAccounts: [
          { type: 'google_oauth', email: 'g@example.com' },
          { type: 'email', address: 'a@example.com' },
        ],
      })
    ).toBe('a@example.com');
  });

  it('ignores other account types and non-emails', () => {
    expect(
      privyUserEmail({
        linkedAccounts: [
          { type: 'wallet', address: '0xabc' },
          { type: 'github_oauth', email: 'gh@example.com' },
        ],
      })
    ).toBeUndefined();
    expect(privyUserEmail(null)).toBeUndefined();
    expect(privyUserEmail({ email: { address: 'not-an-email' } })).toBeUndefined();
  });
});
