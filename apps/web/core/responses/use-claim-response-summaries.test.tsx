import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaimResponseSummaryBatch } from './use-claim-response-summaries';

const mocks = vi.hoisted(() => ({
  loadCaches: vi.fn(),
  personalSpaceId: 'profile-1' as string | null,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: true }),
}));

vi.mock('./claim-response-summaries', async importOriginal => {
  const actual = await importOriginal<typeof import('./claim-response-summaries')>();
  return {
    ...actual,
    loadClaimResponseSummaryCaches: (...args: unknown[]) => mocks.loadCaches(...args),
  };
});

beforeEach(() => {
  mocks.loadCaches.mockReset();
  mocks.loadCaches.mockResolvedValue(new Map());
  mocks.personalSpaceId = 'profile-1';
});

describe('useClaimResponseSummaryBatch', () => {
  it('loads all 50 visible claim-kind pairs through one batch query function', async () => {
    const targets = Array.from({ length: 50 }, (_, index) => ({
      entityId: `claim-${index}`,
      responseKind: index % 2 === 0 ? ('stance' as const) : ('veracity' as const),
    }));
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useClaimResponseSummaryBatch({ spaceId: 'space-1', targets, enabled: true }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.loadCaches).toHaveBeenCalledOnce();
    expect(mocks.loadCaches).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        personalSpaceId: 'profile-1',
        targets: expect.arrayContaining(targets),
      })
    );
  });

  it('isolates the batch cache by viewer account and exact space', async () => {
    const { queryClient, wrapper } = createHarness();
    const targets = [{ entityId: 'claim-1', responseKind: 'stance' as const }];
    const first = renderHook(() => useClaimResponseSummaryBatch({ spaceId: 'space-1', targets, enabled: true }), {
      wrapper,
    });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    mocks.personalSpaceId = 'profile-2';
    first.rerender();
    await waitFor(() => expect(mocks.loadCaches).toHaveBeenCalledTimes(2));

    expect(
      queryClient.getQueryState(['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']])?.status
    ).toBe('success');
    expect(
      queryClient.getQueryState(['claim-response-summaries', 'profile-2', 'space-1', ['claim-1:stance']])?.status
    ).toBe('success');
  });

  it('starts a separate batch when the exact space changes', async () => {
    const { queryClient, wrapper } = createHarness();
    const targets = [{ entityId: 'claim-1', responseKind: 'stance' as const }];
    const { result, rerender } = renderHook(
      ({ spaceId }) => useClaimResponseSummaryBatch({ spaceId, targets, enabled: true }),
      { wrapper, initialProps: { spaceId: 'space-1' } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ spaceId: 'space-2' });
    await waitFor(() => expect(mocks.loadCaches).toHaveBeenCalledTimes(2));

    expect(mocks.loadCaches.mock.calls.map(call => (call[0] as { spaceId: string }).spaceId)).toEqual([
      'space-1',
      'space-2',
    ]);
    expect(
      queryClient.getQueryState(['claim-response-summaries', 'profile-1', 'space-1', ['claim-1:stance']])?.status
    ).toBe('success');
    expect(
      queryClient.getQueryState(['claim-response-summaries', 'profile-1', 'space-2', ['claim-1:stance']])?.status
    ).toBe('success');
  });
});

function createHarness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}
