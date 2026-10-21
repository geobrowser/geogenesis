import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore } from 'jotai';
import { beforeEach, describe, expect, it } from 'vitest';

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

describe('useGoogleSignInOptions', () => {
  it('offers Google with the flag on', () => {
    expect(renderOptions(true)).toEqual({ loginMethods: GOOGLE_SIGN_IN_METHODS });
    expect(GOOGLE_SIGN_IN_METHODS).toContain('google');
  });

  it('adds nothing with the flag off', () => {
    expect(renderOptions(false)).toBeUndefined();
  });
});
