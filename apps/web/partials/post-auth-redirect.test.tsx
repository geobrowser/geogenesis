import { cleanup, render, waitFor } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PostAuthRedirect } from './post-auth-redirect';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  smartAccount: null as object | null,
  personalSpace: { personalSpaceId: null as string | null, isRegistered: false, isFetched: true },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => mocks.personalSpace }));

const COMPOSE = '/space/space-1/ranking/compose?parentEntityId=ranking-1';

beforeEach(() => {
  mocks.push.mockReset();
  mocks.smartAccount = null;
  mocks.personalSpace = { personalSpaceId: null, isRegistered: false, isFetched: true };
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe('PostAuthRedirect after a Google sign-in', () => {
  it('sends an existing account back to where it pressed, from the address kept across the redirect', async () => {
    window.sessionStorage.setItem('postOnboardingRedirect', JSON.stringify(COMPOSE));
    mocks.smartAccount = { account: { address: '0xviewer' } };
    mocks.personalSpace = { personalSpaceId: 'personal-1', isRegistered: true, isFetched: true };

    render(
      <Provider store={createStore()}>
        <PostAuthRedirect />
      </Provider>
    );

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(COMPOSE));
    expect(mocks.push).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem('postOnboardingRedirect')).toBe('null');
  });

  // A new account: onboarding owns the redirect, once its space is made.
  it('leaves a new account to onboarding', async () => {
    window.sessionStorage.setItem('postOnboardingRedirect', JSON.stringify(COMPOSE));
    mocks.smartAccount = { account: { address: '0xviewer' } };

    render(
      <Provider store={createStore()}>
        <PostAuthRedirect />
      </Provider>
    );

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
