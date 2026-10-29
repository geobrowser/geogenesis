import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api';
import { debateQueryKeys } from '../hooks';
import { useCreateAdminMatch } from './admin-hooks';

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreateAdminMatch', () => {
  // GEO-3532: the new match is pending, which holds its time for both debaters.
  it('refreshes the admin calendar and both debaters’ weeks once the match is made', async () => {
    vi.spyOn(api, 'createAdminScheduledDebate').mockResolvedValue(
      {} as Awaited<ReturnType<typeof api.createAdminScheduledDebate>>
    );
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCreateAdminMatch(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(() =>
      result.current.mutateAsync({ firstUserId: 'a', secondUserId: 'b', start: new Date(Date.now() + 86_400_000) })
    );

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(
      expect.arrayContaining([
        debateQueryKeys.adminScheduledDebatesRoot,
        debateQueryKeys.schedulablePeopleRoot('acct'),
        debateQueryKeys.peerScheduleRoot('acct'),
      ])
    );
  });

  it('stays pending until the admin calendar has read the new match', async () => {
    vi.spyOn(api, 'createAdminScheduledDebate').mockResolvedValue(
      {} as Awaited<ReturnType<typeof api.createAdminScheduledDebate>>
    );
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let calendarRead = () => {};
    vi.spyOn(client, 'invalidateQueries').mockImplementation(filters =>
      filters?.queryKey === debateQueryKeys.adminScheduledDebatesRoot
        ? new Promise<void>(resolve => (calendarRead = resolve))
        : Promise.resolve()
    );
    const { result } = renderHook(() => useCreateAdminMatch(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    let settled = false;
    const created = result.current
      .mutateAsync({ firstUserId: 'a', secondUserId: 'b', start: new Date(Date.now() + 86_400_000) })
      .then(() => (settled = true));
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(settled).toBe(false);

    await act(async () => {
      calendarRead();
      await created;
    });
    expect(settled).toBe(true);
  });
});
