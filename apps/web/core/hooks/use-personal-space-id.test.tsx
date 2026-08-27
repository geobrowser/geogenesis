import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersonalSpaceId } from './use-personal-space-id';

const ADDRESS = '0x5D6d0E45D76D360AB4F94941CE9a005b0AEa2ebD';
const SPACE_ID = 'd4bee0928fb5405baba3b1513f085835';

const getSpaceByAddress = vi.fn();

vi.mock('~/core/io/queries', () => ({
  getSpaceByAddress: (address: string) => getSpaceByAddress(address),
}));

vi.mock('./use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: ADDRESS } }, isLoading: false }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getSpaceByAddress.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePersonalSpaceId', () => {
  it('reports a registered space', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isRegistered).toBe(true));
    expect(result.current.personalSpaceId).toBe(SPACE_ID);
  });

  it('keeps polling until the space appears, then reports it', async () => {
    // The reported bug: registration lands on-chain seconds in, but the indexer
    // serves it later. Without polling the cached "not registered" stuck for the
    // full 5-minute staleTime — no personal-space chip, and every write refused —
    // and client navigation could not clear it, only a hard reload.
    getSpaceByAddress
      .mockReturnValueOnce(Effect.succeed(null))
      .mockReturnValueOnce(Effect.succeed(null))
      .mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.isRegistered).toBe(false);

    await waitFor(() => expect(result.current.isRegistered).toBe(true), { timeout: 15_000 });
    expect(result.current.personalSpaceId).toBe(SPACE_ID);
    expect(getSpaceByAddress.mock.calls.length).toBeGreaterThan(1);
  }, 20_000);

  it('stops polling once a space is found', async () => {
    getSpaceByAddress.mockReturnValue(Effect.succeed({ id: SPACE_ID }));

    const { result } = renderHook(() => usePersonalSpaceId(), { wrapper });
    await waitFor(() => expect(result.current.isRegistered).toBe(true));

    const callsWhenResolved = getSpaceByAddress.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 4_000));

    // A space is never un-created, so the interval must end permanently rather
    // than keep a request running for every signed-in user forever.
    expect(getSpaceByAddress.mock.calls.length).toBe(callsWhenResolved);
  }, 10_000);
});
