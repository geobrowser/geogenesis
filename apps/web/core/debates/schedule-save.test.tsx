import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AvailabilityBlock } from '~/core/availability/blocks';

import { GeoChatRequestError, GeoChatSessionError } from './api';
import { resetGeoChatAccountStatusForTests, setLiveGeoChatAccountKey } from './geo-chat-account-status';
import { SCHEDULE_SAVE_REFUSED_RETRIES, useSaveDebateSchedule } from './hooks';

const mocks = vi.hoisted(() => ({
  replaceDebateSchedule: vi.fn(),
  setToast: vi.fn(),
  accountKey: 'user-a' as string | null,
}));

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  replaceDebateSchedule: mocks.replaceDebateSchedule,
}));
vi.mock('~/core/wallet/auth-hooks', () => ({
  usePrivy: () => ({ ready: true, authenticated: true, user: mocks.accountKey ? { id: mocks.accountKey } : null }),
}));
vi.mock('~/core/auth/identity-token', () => ({ getCachedIdentityToken: vi.fn(), useIdentityTokenSync: vi.fn() }));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/availability/schedule-analytics', () => ({ debateScheduleSaved: vi.fn() }));

const refused = () => new GeoChatSessionError(new GeoChatRequestError('not yet', 'no_personal_space', 401));
const saved = (label: string) => ({
  is_set: true,
  schedule: { timezone: 'UTC', slot_minutes: 30, recurring: [], dated: [], label },
});
const blocksA = [{ kind: 'recurring', weekday: 0, start: 540, end: 600 }] as unknown as AvailabilityBlock[];
const blocksB = [{ kind: 'recurring', weekday: 1, start: 540, end: 600 }] as unknown as AvailabilityBlock[];

function render(queryClient = new QueryClient()) {
  const view = renderHook(() => useSaveDebateSchedule({ surface: 'navbar' }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetGeoChatAccountStatusForTests();
  setLiveGeoChatAccountKey('user-a');
  mocks.accountKey = 'user-a';
  mocks.replaceDebateSchedule.mockReset();
  mocks.setToast.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSaveDebateSchedule while the session is refused', () => {
  it('runs saves in order, so an older save still retrying cannot land after a newer one', async () => {
    const order: string[] = [];
    let aAttempts = 0;
    mocks.replaceDebateSchedule.mockImplementation(async (payload: { recurring: Array<{ weekday: number }> }) => {
      const label = payload.recurring[0]?.weekday === 1 ? 'A' : 'B';
      if (label === 'A' && ++aAttempts < 3) throw refused();
      order.push(label);
      return saved(label);
    });
    const first = render();
    const second = render(first.queryClient);

    act(() => first.result.current.mutate(blocksA));
    act(() => second.result.current.mutate(blocksB));
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(order).toEqual(['A', 'B']);
  });

  it('stops retrying and never writes once the saving account signs out or switches', async () => {
    mocks.replaceDebateSchedule.mockRejectedValue(refused());
    const { result, unmount } = render();

    act(() => result.current.mutate(blocksA));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.replaceDebateSchedule).toHaveBeenCalledTimes(1);
    unmount();

    setLiveGeoChatAccountKey('user-y');
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(mocks.replaceDebateSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.setToast).not.toHaveBeenCalled();
  });

  it('gives up after about five minutes and says so without the raw message', async () => {
    mocks.replaceDebateSchedule.mockRejectedValue(refused());
    const { result } = render();

    act(() => result.current.mutate(blocksA));
    await act(() => vi.advanceTimersByTimeAsync(4 * 60_000));
    expect(mocks.setToast).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(2 * 60_000));

    expect(mocks.replaceDebateSchedule).toHaveBeenCalledTimes(SCHEDULE_SAVE_REFUSED_RETRIES + 1);
    expect(mocks.setToast).toHaveBeenCalledTimes(1);
    const toast = mocks.setToast.mock.calls[0]![0] as { props: { children: string } };
    expect(toast.props.children).toBe('We couldn’t save your availability. Please try again.');
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));
    expect(mocks.replaceDebateSchedule).toHaveBeenCalledTimes(SCHEDULE_SAVE_REFUSED_RETRIES + 1);
  });
});
