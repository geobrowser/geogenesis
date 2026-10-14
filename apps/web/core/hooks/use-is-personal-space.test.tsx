import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsPersonalSpace } from './use-is-personal-space';

const PERSONAL = '73a82967cb12f604f9589ac4bc8024cb';

const fetchPersonalSpaceIds = vi.hoisted(() =>
  vi.fn(async (ids: string[]) => new Set(ids.filter(id => id === PERSONAL)))
);
vi.mock('~/core/io/subgraph/fetch-personal-space-ids', () => ({ fetchPersonalSpaceIds }));

afterEach(() => {
  fetchPersonalSpaceIds.mockClear();
});

describe('useIsPersonalSpace', () => {
  it("keeps a space's answer after every card asking for it has unmounted", async () => {
    // The app's client garbage-collects inactive queries; a space type never changes, so this one
    // must not be, or the next card from the space asks again.
    // A short window stands in for the app's default, so the test can outlive it.
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 10 } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const first = renderHook(() => useIsPersonalSpace(PERSONAL), { wrapper });
    await waitFor(() => expect(first.result.current).toBe(true));
    first.unmount();

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(client.getQueryData(['is-personal-space', PERSONAL])).toBe(true);

    const second = renderHook(() => useIsPersonalSpace(PERSONAL), { wrapper });
    expect(second.result.current).toBe(true);
    expect(fetchPersonalSpaceIds).toHaveBeenCalledTimes(1);
  });
});
