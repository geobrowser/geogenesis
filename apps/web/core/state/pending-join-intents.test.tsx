import { act, cleanup, renderHook } from '@testing-library/react';

import type { PropsWithChildren } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext } from '~/core/action-context';
import { beginAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';

import { pendingJoinIntentsAtom, useDeferredJoin } from './pending-join-intents';

vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
});
afterEach(cleanup);

describe('deferred joins after another sign-in', () => {
  it.each(['closed', 'superseded'] as const)('submits once with the original context after %s auth', outcome => {
    const store = createStore();
    const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
    const attempt = beginAuthAttempt({ auth_intent: 'join_space', auth_continuation: 'queued' });
    const submit = vi.fn(() => {
      expect(snapshotActionContext('join_space_button', 'space', 'space-1')).toMatchObject({
        component: 'join_space_button',
        target_id: 'space-1',
        auth_attempt_id: attempt.id,
      });
    });
    const hook = renderHook(({ authenticated }) => useDeferredJoin('space-1', authenticated, submit), {
      wrapper,
      initialProps: { authenticated: false },
    });
    act(() => hook.result.current());
    act(() => {
      if (outcome === 'closed') finishAuthAttempt('closed');
      beginAuthAttempt({ component: 'navbar', auth_control: 'sign_in' });
      finishAuthAttempt('signed_in');
    });
    expect(submit).not.toHaveBeenCalled();
    expect(store.get(pendingJoinIntentsAtom)).toEqual(['space-1']);
    hook.rerender({ authenticated: true });
    expect(submit).toHaveBeenCalledOnce();
    expect(store.get(pendingJoinIntentsAtom)).toEqual([]);
    hook.rerender({ authenticated: true });
    expect(submit).toHaveBeenCalledOnce();
  });
});
