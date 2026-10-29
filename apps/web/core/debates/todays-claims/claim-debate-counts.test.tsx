import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { type ReactNode, createElement } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaimDebateCounts } from './claim-debate-counts';

const mocks = vi.hoisted(() => ({
  getClaimDebateCounts: vi.fn(),
  auth: { ready: true, accountKey: 'account-a' as string | null },
}));

vi.mock('../api', async importOriginal => ({
  ...(await importOriginal<typeof import('../api')>()),
  getClaimDebateCounts: mocks.getClaimDebateCounts,
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({
    ready: mocks.auth.ready,
    authenticated: mocks.auth.accountKey !== null,
    accountKey: mocks.auth.accountKey,
    getPrivyIdentityToken: vi.fn(),
  }),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

const A = 'a1000000000000000000000000000001';
const B = 'a1000000000000000000000000000002';
const ASKS = [
  { claimId: A, since: '2026-10-28T00:00:00-04:00' },
  { claimId: B, since: '2026-10-26T00:00:00-04:00' },
];

describe('useClaimDebateCounts', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    mocks.getClaimDebateCounts.mockReset();
    mocks.auth = { ready: true, accountKey: 'account-a' };
  });

  // geo-chat refuses a caller with no account, and the counts are read once: asked too early, the
  // refusal would stand for the visit, and the picker's order would be set without them.
  it('waits, as loading, for Privy to restore the account, then asks with it', async () => {
    mocks.auth = { ready: false, accountKey: null };
    mocks.getClaimDebateCounts.mockResolvedValue({
      counts: [
        { claim_entity_id: A, debates: 2 },
        { claim_entity_id: B, debates: 0 },
      ],
    });

    const { result, rerender } = renderHook(() => useClaimDebateCounts(ASKS), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(mocks.getClaimDebateCounts).not.toHaveBeenCalled();

    mocks.auth = { ready: true, accountKey: 'account-a' };
    rerender();

    await waitFor(() => expect(result.current.byClaimId).not.toBeNull());
    expect(Object.fromEntries(result.current.byClaimId!)).toEqual({ [A]: 2, [B]: 0 });
    expect(mocks.getClaimDebateCounts.mock.calls[0]![0]).toEqual([
      { claim_entity_id: A, since: '2026-10-28T00:00:00-04:00' },
      { claim_entity_id: B, since: '2026-10-26T00:00:00-04:00' },
    ]);
    expect(mocks.getClaimDebateCounts.mock.calls[0]![2]).toBe('account-a');
  });

  it('settles with no counts once Privy says nobody is signed in', () => {
    mocks.auth = { ready: true, accountKey: null };

    const { result } = renderHook(() => useClaimDebateCounts(ASKS), { wrapper });

    expect(result.current.isLoading).toBe(false);
    expect(mocks.getClaimDebateCounts).not.toHaveBeenCalled();
  });

  it('answers null, not zeros, when geo-chat cannot count', async () => {
    mocks.getClaimDebateCounts.mockImplementation(() => Promise.reject(new Error('404 not found')));

    const { result } = renderHook(() => useClaimDebateCounts(ASKS), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.byClaimId).toBeNull();
  });
});
