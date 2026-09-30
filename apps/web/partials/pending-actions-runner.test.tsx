import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';

import type { PropsWithChildren } from 'react';

import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { snapshotActionContext, withActionContext } from '~/core/action-context';
import { beginAuthAttempt, finishAuthAttempt, resetAuthAttempt } from '~/core/auth-attempt';
import { pendingActionsAtom, useEnqueuePendingAction } from '~/core/state/pending-actions';

import { PendingActionsRunner } from './pending-actions-runner';

const mocks = vi.hoisted(() => ({ authenticated: false, registered: false, reportError: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture: vi.fn() }));
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
