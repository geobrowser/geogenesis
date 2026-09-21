import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from '../types';
import { useQueryAllEntities } from './use-store';

const entity = {
  id: 'entity-1',
  name: null,
  description: null,
  spaces: ['space-1'],
  types: [],
  relations: [],
  values: [],
} as Entity;

const mocks = vi.hoisted(() => ({
  syncMany: vi.fn(),
  getEntity: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('./orm', async importOriginal => {
  const original = await importOriginal<typeof import('./orm')>();
  return { ...original, E: { ...original.E, syncMany: mocks.syncMany } };
});
vi.mock('./use-sync-engine', () => ({
  useSyncEngine: () => ({ store: { getEntity: mocks.getEntity }, stream: { emit: mocks.emit } }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useQueryAllEntities', () => {
  beforeEach(() => {
    mocks.syncMany.mockReset();
    mocks.getEntity.mockReset();
    mocks.emit.mockReset();
    mocks.getEntity.mockReturnValue(entity);
  });

  it('passes empty-name inclusion and the React Query cancellation signal through every page', async () => {
    mocks.syncMany.mockResolvedValue({
      merged: [entity],
      remote: [entity],
      endCursor: null,
      hasNextPage: false,
    });

    const { result } = renderHook(() => useQueryAllEntities({ where: {}, includeEmptyNames: true }), { wrapper });
    await waitFor(() => expect(result.current.isFetched).toBe(true));

    expect(mocks.syncMany).toHaveBeenCalledWith(
      expect.objectContaining({
        includeEmptyNames: true,
        signal: expect.any(AbortSignal),
      })
    );
    expect(result.current.entities).toEqual([entity]);
  });

  it('aborts an exhaustive walk when its last observer unmounts', async () => {
    let signal: AbortSignal | undefined;
    mocks.syncMany.mockImplementation(
      ({ signal: querySignal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = querySignal;
          querySignal.addEventListener('abort', () => reject(querySignal.reason));
        })
    );

    const hook = renderHook(() => useQueryAllEntities({ where: {} }), { wrapper });
    await waitFor(() => expect(signal).toBeDefined());
    hook.unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('reports cached entities as available after a background refresh fails', async () => {
    mocks.syncMany.mockResolvedValueOnce({
      merged: [entity],
      remote: [entity],
      endCursor: null,
      hasNextPage: false,
    });

    const { result } = renderHook(() => useQueryAllEntities({ where: {} }), { wrapper });
    await waitFor(() => expect(result.current.entities).toEqual([entity]));

    mocks.syncMany.mockRejectedValueOnce(new Error('refresh failed'));
    await act(async () => void (await result.current.refetch()));

    await waitFor(() => expect(result.current.error).toEqual(new Error('refresh failed')));
    expect(result.current.entities).toEqual([entity]);
    expect(result.current.dataAvailable).toBe(true);
  });
});
