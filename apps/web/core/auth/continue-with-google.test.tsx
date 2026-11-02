import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useContinueWithGoogle } from './continue-with-google';

const mocks = vi.hoisted(() => ({
  signIn: undefined as undefined | ((properties: Record<string, unknown>) => Promise<void>),
}));

// Undefined is Google not offered; the flag and in-app browser gating are tested in `google-oauth`.
vi.mock('~/core/auth/google-oauth', () => ({ useGoogleOAuthSignIn: () => mocks.signIn }));

/** The redirect has started and the page is still here: Google's page has not loaded yet. */
const pending = () => new Promise<void>(() => {});

beforeEach(() => {
  mocks.signIn = undefined;
});

describe('useContinueWithGoogle', () => {
  it('is undefined where Google is not offered', () => {
    const { result } = renderHook(() => useContinueWithGoogle());
    expect(result.current).toBeUndefined();
  });

  it('starts with the properties it is given and is starting until the page goes', async () => {
    const signIn = vi.fn(pending);
    mocks.signIn = signIn;
    const { result } = renderHook(() => useContinueWithGoogle());

    act(() => void result.current!.start({ component: 'save_votes_prompt' }));

    expect(signIn).toHaveBeenCalledWith({ component: 'save_votes_prompt' });
    expect(result.current!.status).toBe('starting');
  });

  it('reports a start that failed', async () => {
    mocks.signIn = vi.fn(() => Promise.reject(new Error('blocked')));
    const { result } = renderHook(() => useContinueWithGoogle());

    await act(() => result.current!.start({}));

    expect(result.current!.status).toBe('failed');
  });

  // Back from Google's page, restored from the back/forward cache with its state as it was left.
  it('is ready again when the page comes back from the back/forward cache', () => {
    mocks.signIn = vi.fn(pending);
    const { result } = renderHook(() => useContinueWithGoogle());
    act(() => void result.current!.start({}));

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    expect(result.current!.status).toBe('idle');
  });

  it('stays starting on an ordinary page show', () => {
    mocks.signIn = vi.fn(pending);
    const { result } = renderHook(() => useContinueWithGoogle());
    act(() => void result.current!.start({}));

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });

    expect(result.current!.status).toBe('starting');
  });
});
