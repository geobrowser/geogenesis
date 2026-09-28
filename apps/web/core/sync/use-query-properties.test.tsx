import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueryProperties } from './use-store';

const mocks = vi.hoisted(() => ({ getProperties: vi.fn() }));

vi.mock('../io/queries', async importOriginal => {
  const original = await importOriginal<typeof import('../io/queries')>();
  return { ...original, getProperties: mocks.getProperties };
});
vi.mock('../utils/property', () => ({ Properties: { reconstructFromStore: () => null } }));
vi.mock('./use-sync-engine', () => ({
  useSyncEngine: () => ({ store: { getProperty: () => null } }),
}));

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useQueryProperties (GEO-3067)', () => {
  beforeEach(() => {
    mocks.getProperties.mockReset();
    mocks.getProperties.mockImplementation((ids: string[]) =>
      Effect.succeed(ids.map(id => ({ id, name: id, dataType: 'TEXT' })))
    );
  });

  it('sends no request for an empty id list and is not left loading', () => {
    const { result } = renderHook(() => useQueryProperties({ ids: [] }), { wrapper: makeWrapper() });

    expect(mocks.getProperties).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.properties).toEqual([]);
  });

  it('shares one request for the same ids in a different order', async () => {
    const wrapper = makeWrapper();
    const first = renderHook(() => useQueryProperties({ ids: ['b', 'a'] }), { wrapper });
    await waitFor(() => expect(first.result.current.properties).toHaveLength(2));

    const second = renderHook(() => useQueryProperties({ ids: ['a', 'b'] }), { wrapper });
    await waitFor(() => expect(second.result.current.properties).toHaveLength(2));

    expect(mocks.getProperties).toHaveBeenCalledTimes(1);
    expect(mocks.getProperties).toHaveBeenCalledWith(['a', 'b']);
    expect(first.result.current.properties.map(p => p.id)).toEqual(['b', 'a']);
  });
});
