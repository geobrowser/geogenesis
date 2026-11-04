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
  const restored = renderHook(() => useContinueWithGoogle());
  act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  restored.unmount();
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
  it('starts only one request when pressed twice before React renders', () => {
    mocks.signIn = vi.fn(pending);
    const { result } = renderHook(() => useContinueWithGoogle());
    act(() => {
      void result.current!.start({});
      void result.current!.start({});
    });
    expect(mocks.signIn).toHaveBeenCalledOnce();
  });

  it('keeps one pending start across surfaces, including before React renders', () => {
    mocks.signIn = vi.fn(pending);
    const sheet = renderHook(() => useContinueWithGoogle());
    const popup = renderHook(() => useContinueWithGoogle());

    act(() => {
      void sheet.result.current!.start({ component: 'save_votes_prompt' });
      void popup.result.current!.start({ component: 'explore_email_capture' });
    });

    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith({ component: 'save_votes_prompt' });
    expect(sheet.result.current!.status).toBe('starting');
    expect(popup.result.current!.status).toBe('starting');
  });

  it('keeps the pending redirect locked when its initiating surface unmounts', () => {
    mocks.signIn = vi.fn(pending);
    const sheet = renderHook(() => useContinueWithGoogle());
    act(() => void sheet.result.current!.start({ component: 'save_votes_prompt' }));
    sheet.unmount();
    const popup = renderHook(() => useContinueWithGoogle());

    act(() => void popup.result.current!.start({ component: 'explore_email_capture' }));

    expect(mocks.signIn).toHaveBeenCalledOnce();
    expect(popup.result.current!.status).toBe('starting');
  });

  it('unlocks both surfaces after failure and permits a retry from the other surface', async () => {
    let fail!: (error: Error) => void;
    mocks.signIn = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => (fail = reject)))
      .mockImplementation(pending);
    const sheet = renderHook(() => useContinueWithGoogle());
    const popup = renderHook(() => useContinueWithGoogle());
    act(() => void sheet.result.current!.start({}));

    await act(async () => fail(new Error('blocked')));

    expect(sheet.result.current!.status).toBe('failed');
    expect(popup.result.current!.status).toBe('idle');
    act(() => void popup.result.current!.start({}));
    expect(sheet.result.current!.status).toBe('starting');
    expect(popup.result.current!.status).toBe('starting');
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });

  it('ignores a late failure from before a back/forward-cache restore', async () => {
    let failOldStart!: (error: Error) => void;
    mocks.signIn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            failOldStart = reject;
          })
      )
      .mockImplementation(pending);
    const sheet = renderHook(() => useContinueWithGoogle());
    const popup = renderHook(() => useContinueWithGoogle());
    act(() => void sheet.result.current!.start({}));
    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    expect(sheet.result.current!.status).toBe('idle');
    expect(popup.result.current!.status).toBe('idle');
    act(() => void popup.result.current!.start({}));
    await act(async () => {
      failOldStart(new Error('old request failed'));
    });
    expect(sheet.result.current!.status).toBe('starting');
    expect(popup.result.current!.status).toBe('starting');
  });
});
