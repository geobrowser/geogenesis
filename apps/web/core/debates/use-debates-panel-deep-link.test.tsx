import '@testing-library/jest-dom/vitest';
import { cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  search: '',
  open: vi.fn(),
  signIn: vi.fn(),
  signInComplete: undefined as (() => void) | undefined,
  signInOptions: undefined as { redirectTo?: string; onError?: () => void } | undefined,
}));

vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: mocks.ready, authenticated: mocks.authenticated }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({ open: mocks.open }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (onComplete: () => void, options: typeof mocks.signInOptions) => {
    mocks.signInComplete = onComplete;
    mocks.signInOptions = options;
    return mocks.signIn;
  },
}));

const { useDebatesPanelDeepLink } = await import('./use-debates-panel-deep-link');

beforeEach(() => {
  mocks.ready = true;
  mocks.authenticated = false;
  mocks.search = '';
  mocks.open = vi.fn();
  mocks.signIn = vi.fn();
  mocks.signInComplete = undefined;
  mocks.signInOptions = undefined;
});

afterEach(() => cleanup());

// The scheduling emails link here. Signed out, the hub has no Requests tab, so it opened on Explore
// and the request the email was about was nowhere to be seen.
describe('a link to a tab that needs sign-in', () => {
  it('asks a signed-out visitor to sign in, then opens the tab the link named', () => {
    mocks.search = 'modal=debates&modalTarget=requests';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.open).not.toHaveBeenCalled();

    mocks.signInComplete?.();
    expect(mocks.open).toHaveBeenCalledWith('requests');
  });

  it('still opens the hub if they dismiss the sign-in', () => {
    mocks.search = 'modal=debates&modalTarget=requests';
    renderHook(() => useDebatesPanelDeepLink());

    mocks.signInOptions?.onError?.();
    expect(mocks.open).toHaveBeenCalledWith('requests');
  });

  it('sends a new account back to the link itself after onboarding', () => {
    mocks.search = 'modal=debates&modalTarget=requests&via=email';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signInOptions?.redirectTo).toBe('/explore?modal=debates&modalTarget=requests&via=email');
  });

  it('opens the tab straight away for someone already signed in', () => {
    mocks.authenticated = true;
    mocks.search = 'modal=debates&modalTarget=requests';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith('requests');
  });

  it('decides nothing until Privy has restored the session', () => {
    mocks.ready = false;
    mocks.search = 'modal=debates&modalTarget=requests';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe('a link to a tab that reads fine signed out', () => {
  it('opens it with no sign-in, as before', () => {
    mocks.search = 'modal=debates&modalTarget=people';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith('people');
  });

  it('opens without waiting for Privy, as before', () => {
    mocks.ready = false;
    mocks.search = 'modal=debates';
    renderHook(() => useDebatesPanelDeepLink());

    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith(undefined);
  });
});
