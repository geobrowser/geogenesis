import { QueryClient } from '@tanstack/react-query';

import { describe, expect, it, vi } from 'vitest';

import { SYNC_READ_OPTIONS } from './orm';

vi.mock('./use-sync-engine.tsx', () => ({}));
vi.mock('./use-store.tsx', () => ({}));
vi.mock('../database/entities', () => ({ readTypes: () => [] }));

/**
 * The app's `QueryClient` sets a global `staleTime`, which is right for `useQuery` — it decides
 * whether a mount or a focus refetches. The same setting also governs `fetchQuery`, where it
 * decides something different in kind: whether a deliberate read issues a request at all.
 *
 * The sync layer must not inherit it. A sync answered from cache is one that returns pre-write
 * data, and nothing renders differently when that happens, so the regression would be invisible.
 */
describe('sync reads opt out of the global staleTime', () => {
  it('asks for no caching at all', () => {
    expect(SYNC_READ_OPTIONS.staleTime).toBe(0);
  });

  it('overrides a client default when spread into fetchQuery', () => {
    // The constant only helps if it actually wins over the client's own default, so this asserts
    // the mechanism rather than the value: build a client with a long default, spread the options
    // in, and check what the query ends up with.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

    const resolved = client.defaultQueryOptions({
      ...SYNC_READ_OPTIONS,
      queryKey: ['entities-batch-sync', ['entity-1']],
      queryFn: async () => ({}),
    });

    expect(resolved.staleTime).toBe(0);
  });

  it('leaves a query that does not opt out on the client default', () => {
    // The counterpart: without the spread, the inherited value is what applies. If this ever
    // reports 0 the global default has been lost and the test above proves nothing.
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

    const resolved = client.defaultQueryOptions({
      queryKey: ['something-else'],
      queryFn: async () => ({}),
    });

    expect(resolved.staleTime).toBe(30_000);
  });
});
