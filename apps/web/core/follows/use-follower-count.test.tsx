import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { useFollowerCount } from './use-follower-count';

const ENTITY = '73a82967cb12f604f9589ac4bc8024cb';

const fetchFollowers = vi.hoisted(() => vi.fn());
vi.mock('~/core/io/subgraph/fetch-followers', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-followers')>()),
  fetchFollowers,
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedEntities: () => ({ topicIds: new Set(), kinds: new Map(), rows: [], isLoading: false }),
}));

describe('useFollowerCount', () => {
  it('keeps a count it has read when a later refresh fails', async () => {
    fetchFollowers.mockResolvedValueOnce(new Map([[ENTITY, { count: 7, viewerIndexed: false, followerIds: [] }]]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFollowerCount(ENTITY, { kind: 'person' }), { wrapper });
    await waitFor(() => expect(result.current).toBe(7));

    fetchFollowers.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await client.refetchQueries();
    });

    expect(client.getQueryState(['followers', ENTITY, 'interested', null])?.status).toBe('error');
    // React Query tells components about the error on its next scheduled tick; let it.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    expect(result.current).toBe(7);
  });

  it('draws nothing, rather than loading forever, when the first read fails', async () => {
    fetchFollowers.mockRejectedValueOnce(new Error('offline'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFollowerCount(ENTITY, { kind: 'person' }), { wrapper });

    await waitFor(() => expect(result.current).toBe(0));
  });
});
