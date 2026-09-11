import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSpacesByIds } from './use-spaces-by-ids';

const mocks = vi.hoisted(() => ({
  getSpaces: vi.fn(),
}));

vi.mock('~/core/io/queries', () => ({
  getSpaces: (args: { spaceIds?: string[] }) => mocks.getSpaces(args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Ids are sorted before the request, so pad them to keep string order predictable. */
const ids = (count: number) => Array.from({ length: count }, (_, index) => `space-${String(index).padStart(4, '0')}`);

beforeEach(() => {
  mocks.getSpaces.mockReset();
  mocks.getSpaces.mockImplementation(({ spaceIds }: { spaceIds: string[] }) =>
    Effect.succeed(spaceIds.map(id => ({ id })))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const requestedBatches = () => mocks.getSpaces.mock.calls.map(([args]) => args.spaceIds as string[]);

describe('useSpacesByIds', () => {
  it('asks for a small id set in a single request', async () => {
    const { result } = renderHook(() => useSpacesByIds(ids(3)), { wrapper });

    await waitFor(() => expect(result.current.spaces).toHaveLength(3));

    expect(requestedBatches()).toHaveLength(1);
  });

  it('splits a large id set into batches the API will answer in full', async () => {
    const { result } = renderHook(() => useSpacesByIds(ids(250)), { wrapper });

    await waitFor(() => expect(result.current.spaces).toHaveLength(250));

    const batches = requestedBatches();
    expect(batches).toHaveLength(3);
    expect(batches.map(batch => batch.length)).toEqual([100, 100, 50]);
  });

  it('resolves every requested id across the batch boundary', async () => {
    const requested = ids(250);
    const { result } = renderHook(() => useSpacesByIds(requested), { wrapper });

    await waitFor(() => expect(result.current.spaces).toHaveLength(250));

    expect(result.current.spacesById.get(requested[249])).toBeDefined();
    expect(requestedBatches().flat().sort()).toEqual([...requested].sort());
  });

  it('makes no request when disabled', async () => {
    renderHook(() => useSpacesByIds(ids(150), false), { wrapper });

    await waitFor(() => expect(mocks.getSpaces).not.toHaveBeenCalled());
  });
});
