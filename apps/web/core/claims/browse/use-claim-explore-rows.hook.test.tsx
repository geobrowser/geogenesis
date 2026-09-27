import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { useClaimExploreRows } from './use-claim-explore-rows';

const mocks = vi.hoisted(() => ({ fetchExploreRowsByIds: vi.fn() }));

vi.mock('~/core/profile/explore-rows-by-ids', () => ({
  fetchExploreRowsByIds: mocks.fetchExploreRowsByIds,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useClaimExploreRows result stability', () => {
  beforeEach(() => {
    mocks.fetchExploreRowsByIds.mockReset();
    mocks.fetchExploreRowsByIds.mockResolvedValue([
      { entityId: 'entity-1', spaceId: 'space-1' } as ExploreFeedRow,
    ]);
  });

  it('keeps rows and retry callbacks stable across an unrelated rerender', async () => {
    const { result, rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useClaimExploreRows(ids, 'space-1'),
      { initialProps: { ids: ['entity-1'] }, wrapper }
    );
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const firstData = result.current.data;
    const firstRefetch = result.current.refetch;

    rerender({ ids: ['entity-1'] });

    expect(result.current.data).toBe(firstData);
    expect(result.current.refetch).toBe(firstRefetch);
  });
});
