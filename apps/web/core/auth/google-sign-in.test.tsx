import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { featureFlagsStorageKey } from '~/core/state/feature-flags';

import { GOOGLE_SIGN_IN_METHODS, useGoogleSignInOptions } from './google-sign-in';

function renderOptions(flag: boolean) {
  window.localStorage.setItem(featureFlagsStorageKey, JSON.stringify({ googleSignIn: flag }));
  const store = createStore();
  const { result } = renderHook(() => useGoogleSignInOptions(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  return result.current;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useGoogleSignInOptions', () => {
  it('offers Google with the flag on', () => {
    expect(renderOptions(true)).toEqual({ loginMethods: GOOGLE_SIGN_IN_METHODS });
    expect(GOOGLE_SIGN_IN_METHODS).toContain('google');
  });

  it('adds nothing with the flag off', () => {
    expect(renderOptions(false)).toBeUndefined();
  });

  it('keeps the modal email-only in an in-app browser, where Google refuses OAuth', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0.0'
    );
    expect(renderOptions(true)).toBeUndefined();
  });
});
