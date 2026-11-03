import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { getDefaultStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type GeoChatAccountStatus,
  resetGeoChatAccountStatusForTests,
  setGeoChatAccountStatus,
} from './geo-chat-account-status';
import { useGeoChatAccountRecovery } from './use-geo-chat-account-recovery';

const mocks = vi.hoisted(() => ({
  getGeoChatSession: vi.fn(),
  readGeoChatSessionProfile: vi.fn(),
  capture: vi.fn(),
  devLog: vi.fn(),
  createdAt: new Date(0) as Date,
  isRegistered: false,
  retryNow: vi.fn(),
}));

vi.mock('./api', () => ({
  getGeoChatSession: mocks.getGeoChatSession,
  readGeoChatSessionProfile: mocks.readGeoChatSessionProfile,
}));
vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'user-a', getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ user: { createdAt: mocks.createdAt } }) }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));
vi.mock('~/core/utils/dev-log', () => ({ devLog: mocks.devLog }));
vi.mock('./debate-gateway', () => ({ debateGateway: { retryNow: mocks.retryNow } }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ isRegistered: mocks.isRegistered }),
}));
vi.mock('~/partials/onboarding/onboarding-atoms', async () => {
  const { atom } = await import('jotai');
  return { stepAtom: atom('start') };
});

const { stepAtom } = await import('~/partials/onboarding/onboarding-atoms');

const refused: GeoChatAccountStatus = { kind: 'refused', reason: 'setting_up', code: 'no_personal_space' };
const accepted = (profile: 'attached' | 'pending' | 'missing', retryAfterMs: number | null = null) =>
  ({
    kind: 'accepted',
    profile,
    pendingSince: profile === 'attached' ? null : new Date(Date.now() - 1_000).toISOString(),
    retryAfterMs,
  }) as GeoChatAccountStatus;

const mounted: Array<() => void> = [];

function render() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const view = renderHook(() => useGeoChatAccountRecovery(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  mounted.push(view.unmount);
  return { invalidate };
}

function renderHookOnce() {
  const queryClient = new QueryClient();
  const view = renderHook(() => useGeoChatAccountRecovery(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  mounted.push(view.unmount);
  return view;
}

const outcomes = () => mocks.devLog.mock.calls.map(([, payload]) => (payload as { outcome: string }).outcome);

beforeEach(() => {
  vi.useFakeTimers();
  resetGeoChatAccountStatusForTests();
  mocks.getGeoChatSession.mockReset().mockRejectedValue(new Error('refused'));
  mocks.readGeoChatSessionProfile.mockReset().mockResolvedValue({ state: 'pending' });
  mocks.capture.mockReset();
  mocks.devLog.mockReset();
  mocks.createdAt = new Date(0);
  mocks.isRegistered = false;
  mocks.retryNow.mockReset();
  getDefaultStore().set(stepAtom, 'start' as never);
  window.localStorage.clear();
});

afterEach(() => {
  // Outcomes are computed but not sent until `debates_session_outcome` is registered.
  expect(mocks.capture).not.toHaveBeenCalled();
});

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  vi.useRealTimers();
});

describe('useGeoChatAccountRecovery', () => {
  it('leaves retrying a refused exchange to the gateway', async () => {
    render();
    act(() => setGeoChatAccountStatus('user-a', refused));

    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(mocks.getGeoChatSession).not.toHaveBeenCalled();
    expect(mocks.retryNow).not.toHaveBeenCalled();
    expect(outcomes()).toEqual(['session_refused']);
  });

  it('asks the gateway to retry at once when the personal space registers while refused', () => {
    const view = renderHookOnce();
    act(() => setGeoChatAccountStatus('user-a', refused));
    expect(mocks.retryNow).not.toHaveBeenCalled();

    mocks.isRegistered = true;
    view.rerender();

    expect(mocks.retryNow).toHaveBeenCalledTimes(1);
  });

  it('asks the gateway to retry at once when onboarding completes while refused', () => {
    mocks.isRegistered = true;
    render();
    act(() => setGeoChatAccountStatus('user-a', refused));
    mocks.retryNow.mockClear();

    act(() => getDefaultStore().set(stepAtom, 'completed' as never));

    expect(mocks.retryNow).toHaveBeenCalledTimes(1);
  });

  it('does not nudge the gateway for an accepted account', () => {
    mocks.isRegistered = true;
    render();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));
    act(() => getDefaultStore().set(stepAtom, 'completed' as never));

    expect(mocks.retryNow).not.toHaveBeenCalled();
  });

  it('refetches every debates read and records the wait once the account is accepted', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', refused));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    // The gateway's reconnect exchanges the session and records the acceptance.
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates'] });
    expect(outcomes()).toEqual(['session_refused', 'session_accepted']);
    expect(mocks.devLog).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        outcome: 'session_accepted',
        profile_state: 'attached',
        refusal_code: 'no_personal_space',
        refused_ms: 2_000,
      })
    );
  });

  it('refreshes a pending profile on retry_after_ms until it attaches, then refetches the names', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', accepted('pending', 5_000)));

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(2);

    mocks.readGeoChatSessionProfile.mockImplementation(async () => {
      setGeoChatAccountStatus('user-a', accepted('attached'));
      return { state: 'attached' };
    });
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates'] });
    expect(outcomes()).toEqual(['session_accepted', 'profile_attached']);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(3);
  });

  it('waits out a rate limit before reading the profile again', async () => {
    render();
    mocks.readGeoChatSessionProfile.mockResolvedValue({ state: null, retryAfterMs: 20_000 });
    act(() => setGeoChatAccountStatus('user-a', accepted('pending', 5_000)));

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(19_999));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(2);
  });

  it('re-reads the personal space when the profile is missing, so setup can reopen', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', accepted('missing', 60_000)));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['personal-space-id'] });
    expect(outcomes()).toEqual(['session_accepted', 'profile_missing']);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.readGeoChatSessionProfile).toHaveBeenCalledTimes(1);
  });

  it('reports an immediate acceptance for a recent sign-up, with no refusal time', () => {
    mocks.createdAt = new Date(Date.now() - 60_000);
    render();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(outcomes()).toEqual(['session_accepted']);
    expect(mocks.devLog).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ outcome: 'session_accepted', refused_ms: 0, ms_since_sign_up: 60_000 })
    );
  });

  it('reports the first acceptance once per account per browser, not on every reload', () => {
    mocks.createdAt = new Date(Date.now() - 60_000);
    const first = renderHookOnce();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));
    first.unmount();
    resetGeoChatAccountStatusForTests();

    renderHookOnce();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(outcomes()).toEqual(['session_accepted']);
  });

  it('does not report the acceptance of an account that signed up over a day ago', () => {
    mocks.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    render();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(mocks.devLog).not.toHaveBeenCalled();
  });

  it('records nothing for an established account', () => {
    render();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(mocks.devLog).not.toHaveBeenCalled();
  });
});
