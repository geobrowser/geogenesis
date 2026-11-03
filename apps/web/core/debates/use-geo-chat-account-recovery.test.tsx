import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type GeoChatAccountStatus,
  resetGeoChatAccountStatusForTests,
  setGeoChatAccountStatus,
} from './geo-chat-account-status';
import { useGeoChatAccountRecovery } from './use-geo-chat-account-recovery';

const mocks = vi.hoisted(() => ({
  getGeoChatSession: vi.fn(),
  refreshGeoChatSessionProfile: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('./api', () => ({
  getGeoChatSession: mocks.getGeoChatSession,
  refreshGeoChatSessionProfile: mocks.refreshGeoChatSessionProfile,
}));
vi.mock('./hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'user-a', getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('~/core/wallet/auth-hooks', () => ({ usePrivy: () => ({ user: { createdAt: new Date(0) } }) }));
vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

const refused: GeoChatAccountStatus = { kind: 'refused', reason: 'setting_up', code: 'no_personal_space' };
const accepted = (profile: 'attached' | 'pending' | 'missing', retryAfterMs: number | null = null) =>
  ({
    kind: 'accepted',
    profile,
    pendingSince: profile === 'attached' ? null : new Date(Date.now() - 1_000).toISOString(),
    retryAfterMs,
  }) as GeoChatAccountStatus;

function render() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  renderHook(() => useGeoChatAccountRecovery(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { invalidate };
}

const steps = () => mocks.capture.mock.calls.map(([, properties]) => (properties as { step_id: string }).step_id);

beforeEach(() => {
  vi.useFakeTimers();
  resetGeoChatAccountStatusForTests();
  mocks.getGeoChatSession.mockReset().mockRejectedValue(new Error('refused'));
  mocks.refreshGeoChatSessionProfile.mockReset().mockResolvedValue('pending');
  mocks.capture.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGeoChatAccountRecovery', () => {
  it('retries a refused exchange with backoff, for as long as it takes', async () => {
    render();
    act(() => setGeoChatAccountStatus('user-a', refused));

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.getGeoChatSession).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(mocks.getGeoChatSession).toHaveBeenCalledTimes(2);

    // Capped at 30 s and still going after ten minutes.
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    const calls = mocks.getGeoChatSession.mock.calls.length;
    expect(calls).toBeGreaterThan(20);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.getGeoChatSession.mock.calls.length).toBe(calls + 1);
    expect(steps()).toEqual(['session_refused']);
  });

  it('refetches every debates read and records the wait once the account is accepted', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', refused));
    mocks.getGeoChatSession.mockImplementation(async () => {
      setGeoChatAccountStatus('user-a', accepted('attached'));
    });

    await act(() => vi.advanceTimersByTimeAsync(2_000));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates'] });
    expect(steps()).toEqual(['session_refused', 'session_accepted']);
    expect(mocks.capture).toHaveBeenLastCalledWith(
      'onboarding_step_viewed',
      expect.objectContaining({
        flow: 'debates_account',
        step_id: 'session_accepted',
        profile_state: 'attached',
        refusal_code: 'no_personal_space',
        refused_ms: 2_000,
      })
    );
    // Stopped retrying.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.getGeoChatSession).toHaveBeenCalledTimes(1);
  });

  it('waits for a hidden tab to come back before retrying', async () => {
    render();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => setGeoChatAccountStatus('user-a', refused));

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.getGeoChatSession).not.toHaveBeenCalled();

    visibility.mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.getGeoChatSession).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it('refreshes a pending profile on retry_after_ms until it attaches, then refetches the names', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', accepted('pending', 5_000)));

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(mocks.refreshGeoChatSessionProfile).toHaveBeenCalledTimes(2);

    mocks.refreshGeoChatSessionProfile.mockImplementation(async () => {
      setGeoChatAccountStatus('user-a', accepted('attached'));
      return 'attached';
    });
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['debates'] });
    expect(steps()).toEqual(['session_accepted', 'profile_attached']);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.refreshGeoChatSessionProfile).toHaveBeenCalledTimes(3);
  });

  it('re-reads the personal space when the profile is missing, so setup can reopen', async () => {
    const { invalidate } = render();
    act(() => setGeoChatAccountStatus('user-a', accepted('missing', 60_000)));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['personal-space-id'] });
    expect(steps()).toEqual(['session_accepted', 'profile_missing']);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.refreshGeoChatSessionProfile).toHaveBeenCalledTimes(1);
  });

  it('records nothing for an established account', () => {
    render();
    act(() => setGeoChatAccountStatus('user-a', accepted('attached')));

    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
