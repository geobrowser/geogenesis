import { beforeEach, describe, expect, it, vi } from 'vitest';

import { completePrivyAuth } from '~/core/privy-auth-events';

import { markSignedInBefore, wasSignedInBefore } from './signed-in-before';

vi.mock('~/core/analytics', () => ({ restorePrivySession: vi.fn(), trackPrivyAuth: vi.fn() }));

beforeEach(() => localStorage.clear());

describe('signed in before', () => {
  it('is false for a browser that has never signed in, and true after', () => {
    expect(wasSignedInBefore()).toBe(false);
    markSignedInBefore();
    expect(wasSignedInBefore()).toBe(true);
  });

  it('is set by a session restore as well as a sign-in', () => {
    completePrivyAuth({
      user: { id: 'did:privy:1' },
      isNewUser: false,
      wasAlreadyAuthenticated: true,
    } as Parameters<typeof completePrivyAuth>[0]);
    expect(wasSignedInBefore()).toBe(true);
  });
});
