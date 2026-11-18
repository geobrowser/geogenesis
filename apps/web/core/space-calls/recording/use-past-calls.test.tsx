import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { spaceCallKeys } from '../query-keys';
import { PAST_CALLS_LIMIT, usePastCalls } from './hooks';

vi.mock('./api', async importOriginal => ({
  ...(await importOriginal<typeof import('./api')>()),
  listPastCalls: vi.fn().mockResolvedValue({ calls: [] }),
}));

afterEach(() => vi.useRealTimers());

describe('usePastCalls', () => {
  it("keeps the calls as long as Explore's pages after the reader leaves", async () => {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => usePastCalls(true), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    const cached = () => client.getQueryData(spaceCallKeys.explorePast(PAST_CALLS_LIMIT));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hook.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29 * 60_000);
    });
    expect(cached()).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(cached()).toBeUndefined();
  });
});
