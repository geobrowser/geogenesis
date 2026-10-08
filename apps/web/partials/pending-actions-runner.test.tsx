import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';

import type { PropsWithChildren } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext, withActionContext } from '~/core/action-context';
import { beginAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { pendingActionsAtom, useEnqueuePendingAction } from '~/core/state/pending-actions';

import { PendingActionsRunner } from './pending-actions-runner';

const mocks = vi.hoisted(() => ({
  authenticated: false,
  registered: false,
  /** Privy's own signed-in state, which outlives a smart account that is still resolving. */
  privyAuthenticated: false,
  reportError: vi.fn(),
}));
vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));
vi.mock('@geogenesis/auth', () => ({
  usePrivy: () => ({ ready: true, authenticated: mocks.privyAuthenticated }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.authenticated ? {} : null }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: mocks.registered ? 'personal-space' : null,
    isRegistered: mocks.registered,
  }),
}));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => mocks.reportError }));

beforeEach(() => {
  mocks.authenticated = false;
  mocks.registered = false;
  mocks.privyAuthenticated = false;
  localStorage.clear();
  sessionStorage.clear();
  resetAuthAttempt();
});
afterEach(cleanup);

describe('queued actions after another sign-in', () => {
  it.each(['closed', 'superseded'] as const)(
    'replays the original vote once after %s auth and onboarding',
    async outcome => {
      const store = createStore();
      const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
      const enqueue = renderHook(() => useEnqueuePendingAction('winner_vote_button'), { wrapper });
      const attempt = beginAuthAttempt({ auth_intent: 'vote', auth_continuation: 'queued' });
      const context = snapshotActionContext(
        'winner_vote_button',
        'entity',
        'participant',
        {},
        { auth_attempt_id: attempt.id }
      );
      const vote = vi.fn(() => {
        expect(snapshotActionContext('entity_vote_buttons', 'entity', 'participant')).toMatchObject(context);
      });
      act(() =>
        withActionContext(context, () =>
          enqueue.result.current({ id: 'winner-vote', label: 'winner vote', requires: 'personalSpace', run: vote })
        )
      );
      const runner = render(<PendingActionsRunner />, { wrapper });
      act(() => {
        if (outcome === 'closed') finishAuthAttempt('closed');
        beginAuthAttempt({ component: 'navbar', auth_control: 'sign_in' });
        finishAuthAttempt('signed_up');
        mocks.authenticated = true;
      });
      runner.rerender(<PendingActionsRunner />);
      expect(store.get(pendingActionsAtom)).toHaveLength(1);
      expect(vote).not.toHaveBeenCalled();
      mocks.registered = true;
      runner.rerender(<PendingActionsRunner />);
      await waitFor(() => expect(store.get(pendingActionsAtom)).toHaveLength(0));
      expect(vote).toHaveBeenCalledOnce();
      runner.rerender(<PendingActionsRunner />);
      expect(vote).toHaveBeenCalledOnce();
    }
  );
});

function renderQueue() {
  const store = createStore();
  const wrapper = ({ children }: PropsWithChildren) => <Provider store={store}>{children}</Provider>;
  const enqueue = renderHook(() => useEnqueuePendingAction('claim_position_control'), { wrapper });
  return { store, wrapper, enqueue: enqueue.result.current };
}

/**
 * A logout here reloads the page, but one in another tab — or the session expiring — leaves this tab
 * running. Whatever was queued must not wait there for the next account and publish as them.
 */
describe('signing out', () => {
  it('drops what was queued when the account signs out without a reload', () => {
    mocks.privyAuthenticated = true;
    const { store, wrapper, enqueue } = renderQueue();
    act(() => enqueue({ id: 'vote', label: 'vote', requires: 'personalSpace', run: vi.fn() }));
    const runner = render(<PendingActionsRunner />, { wrapper });

    mocks.privyAuthenticated = false;
    runner.rerender(<PendingActionsRunner />);

    expect(store.get(pendingActionsAtom)).toHaveLength(0);
  });

  // The press that queued it was made signed out — that is the whole point of the queue.
  it('keeps what a signed-out visitor queued', () => {
    const { store, wrapper, enqueue } = renderQueue();
    act(() => enqueue({ id: 'vote', label: 'vote', requires: 'personalSpace', run: vi.fn() }));
    const runner = render(<PendingActionsRunner />, { wrapper });
    runner.rerender(<PendingActionsRunner />);

    expect(store.get(pendingActionsAtom)).toHaveLength(1);
  });
});

describe('a press replaced while the one before it runs', () => {
  it('is kept, and runs, rather than being cleared with the one it replaced', async () => {
    mocks.authenticated = true;
    mocks.registered = true;
    const { store, wrapper, enqueue } = renderQueue();
    let finishFirst = () => {};
    const first = vi.fn(() => new Promise<void>(resolve => (finishFirst = resolve)));
    const second = vi.fn();
    act(() => enqueue({ id: 'vote', label: 'vote', requires: 'personalSpace', run: first }));
    render(<PendingActionsRunner />, { wrapper });
    await waitFor(() => expect(first).toHaveBeenCalledOnce());

    act(() => enqueue({ id: 'vote', label: 'vote', requires: 'personalSpace', run: second }));
    await act(async () => finishFirst());

    await waitFor(() => expect(second).toHaveBeenCalledOnce());
    await waitFor(() => expect(store.get(pendingActionsAtom)).toHaveLength(0));
  });
});
