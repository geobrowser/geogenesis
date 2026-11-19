import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

type QueuedConfig = {
  survivesRedirect?: boolean;
  run: (intent: string | undefined, replay: { live: boolean; isCurrent: () => boolean }) => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  queue: vi.fn(),
  setCall: vi.fn(),
  setSeries: vi.fn(),
  setCallAsync: vi.fn(),
  setSeriesAsync: vi.fn(),
  config: undefined as QueuedConfig | undefined,
}));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: false }) }));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.signIn }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: (config: QueuedConfig) => {
    mocks.config = config;
    return { queue: mocks.queue, cancel: vi.fn(), intent: undefined };
  },
}));
vi.mock('./hooks', () => ({
  useCallReminder: () => ({ mutate: mocks.setCall, mutateAsync: mocks.setCallAsync, isPending: false, error: null }),
  useCallSeriesReminder: () => ({
    mutate: mocks.setSeries,
    mutateAsync: mocks.setSeriesAsync,
    isPending: false,
    error: null,
  }),
}));

const { GeoChatRequestError } = await import('~/core/debates/api');
const { useCallRemindPress } = await import('./call-remind-press');

const renderPress = () =>
  renderHook(() =>
    useCallRemindPress({ spaceId: 'space1', callId: 'CALL-1', seriesId: 'series1', call: false, series: false })
  );

const replay = (intent: string) => mocks.config!.run(intent, { live: true, isCurrent: () => true });

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

describe('a call reminder pressed before a Google sign-in', () => {
  it('is kept across the redirect', () => {
    renderPress();
    expect(mocks.config?.survivesRedirect).toBe(true);
  });

  it('sets the reminder it was pressed for, once, from the intent alone', async () => {
    renderPress();

    await act(() => replay('series:series1'));
    await act(() => replay('call:CALL1'));

    expect(mocks.setSeriesAsync).toHaveBeenCalledExactlyOnceWith({ seriesId: 'series1', remind: true });
    expect(mocks.setCallAsync).toHaveBeenCalledExactlyOnceWith({ callId: 'CALL1', remind: true });
  });

  it('is dropped quietly when the call has opened or closed since', async () => {
    mocks.setCallAsync.mockRejectedValue(new GeoChatRequestError('opened', 'call_already_open', 409));
    renderPress();

    await expect(replay('call:CALL1')).resolves.toBeUndefined();
  });
});
