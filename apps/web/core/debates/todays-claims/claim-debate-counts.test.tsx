import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { type ReactNode, createElement } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaimDebateCounts } from './claim-debate-counts';

const mocks = vi.hoisted(() => ({
  getClaimDebateCounts: vi.fn(),
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getClaimDebateCounts: mocks.getClaimDebateCounts,
}));

// Signed out as far as Privy has said yet: the read must not wait on it (GEO-3489).
vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: false, authenticated: false, accountKey: null, getPrivyIdentityToken: vi.fn() }),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

const A = 'a1000000000000000000000000000001';
const B = 'a1000000000000000000000000000002';

describe('useClaimDebateCounts', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    mocks.getClaimDebateCounts.mockReset();
  });

  it('asks before Privy has restored the session, and reads each claim from its own listing', async () => {
    mocks.getClaimDebateCounts.mockResolvedValue({
      counts: [
        { claim_entity_id: A, debates: 2 },
        { claim_entity_id: B, debates: 0 },
      ],
    });
    const asks = [
      { claimId: A, since: '2026-10-28T00:00:00-04:00' },
      { claimId: B, since: '2026-10-26T00:00:00-04:00' },
    ];

    const { result } = renderHook(() => useClaimDebateCounts(asks), { wrapper });

    expect(result.current.byClaimId).toBeNull();
    await waitFor(() => expect(result.current.byClaimId).not.toBeNull());
    expect(Object.fromEntries(result.current.byClaimId!)).toEqual({ [A]: 2, [B]: 0 });
    expect(mocks.getClaimDebateCounts.mock.calls[0]![0]).toEqual([
      { claim_entity_id: A, since: '2026-10-28T00:00:00-04:00' },
      { claim_entity_id: B, since: '2026-10-26T00:00:00-04:00' },
    ]);
  });

  it('answers null, not zeros, when geo-chat cannot count', async () => {
    mocks.getClaimDebateCounts.mockImplementation(() => Promise.reject(new Error('404 not found')));

    const { result } = renderHook(() => useClaimDebateCounts([{ claimId: A, since: '2026-10-28T04:00:00Z' }]), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.byClaimId).toBeNull();
  });
});
