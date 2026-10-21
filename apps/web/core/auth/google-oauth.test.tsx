import { render } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { GoogleOAuthHost, isInAppBrowser } from './google-oauth';

const mocks = vi.hoisted(() => ({ useLoginWithOAuth: vi.fn(() => ({ initOAuth: vi.fn() })) }));

vi.mock('~/core/wallet/auth-hooks', () => ({ useLoginWithOAuth: mocks.useLoginWithOAuth }));
vi.mock('~/core/hooks/use-prepare-onboarding', () => ({ usePrepareOnboarding: () => vi.fn() }));

function renderHost(flag: boolean) {
  window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: flag }));
  render(
    <Provider store={createStore()}>
      <GoogleOAuthHost />
    </Provider>
  );
}

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  mocks.useLoginWithOAuth.mockClear();
  vi.restoreAllMocks();
});

describe('GoogleOAuthHost', () => {
  it('mounts no OAuth hook with the flag off', () => {
    renderHost(false);
    expect(mocks.useLoginWithOAuth).not.toHaveBeenCalled();
  });

  // The page Google returns to is a fresh load: the flag comes from storage after hydration, and the
  // hook must still mount while Privy's callback parameters are in the URL.
  it('mounts the OAuth hook on the return from Google with the flag stored on', () => {
    window.history.replaceState({}, '', '/explore?privy_oauth_code=c&privy_oauth_state=s&privy_oauth_provider=google');
    renderHost(true);

    expect(mocks.useLoginWithOAuth).toHaveBeenCalled();
    expect(new URLSearchParams(window.location.search).get('privy_oauth_code')).toBe('c');
  });
});

describe('isInAppBrowser', () => {
  const withUserAgent = (userAgent: string) =>
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);

  it.each([
    ['Instagram', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0'],
    ['Facebook', 'Mozilla/5.0 (iPhone) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]'],
    ['LinkedIn', 'Mozilla/5.0 (iPhone) Mobile/15E148 LinkedInApp/9.29'],
  ])('detects %s', (_, userAgent) => {
    withUserAgent(userAgent);
    expect(isInAppBrowser()).toBe(true);
  });

  it('passes a regular browser', () => {
    withUserAgent('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    expect(isInAppBrowser()).toBe(false);
  });
});
