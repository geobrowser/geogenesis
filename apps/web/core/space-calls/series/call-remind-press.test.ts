import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  queue: vi.fn(),
  setCall: vi.fn(),
  setSeries: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: false }) }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: () => ({ queue: mocks.queue, cancel: vi.fn(), intent: undefined }),
}));
vi.mock('./hooks', () => ({
  useCallReminder: () => ({ mutate: mocks.setCall, mutateAsync: vi.fn(), isPending: false, error: null }),
  useCallSeriesReminder: () => ({ mutate: mocks.setSeries, mutateAsync: vi.fn(), isPending: false, error: null }),
}));

const { useCallRemindPress } = await import('./call-remind-press');

afterEach(() => vi.clearAllMocks());

describe('useCallRemindPress signed out', () => {
  it('asks for an account on Remind me and sends nothing until then', () => {
    const { result } = renderHook(() =>
      useCallRemindPress({ spaceId: 'space1', callId: 'CALL-1', seriesId: 'series1', call: false, series: false })
    );
    expect(mocks.signIn).not.toHaveBeenCalled();

    act(() => result.current.toggle('series', true));
    expect(mocks.queue).toHaveBeenCalledWith('series:series1');
    expect(mocks.signIn).toHaveBeenCalledWith(
      expect.objectContaining({ auth_control: 'remind_call', target_type: 'space_call_series' }),
      expect.anything()
    );
    expect(mocks.setCall).not.toHaveBeenCalled();
    expect(mocks.setSeries).not.toHaveBeenCalled();
  });
});
