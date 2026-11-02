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

/** One client shared across renders, for tests about what is already cached. */
function sharedWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

/** Padded so the ids read in a predictable order. */
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

  it('fetches only the new id when the set grows, keeping the resolved ones on screen', async () => {
    const [a, b, c] = ids(3);
    const { result, rerender } = renderHook(({ set }) => useSpacesByIds(set), {
      wrapper,
      initialProps: { set: [a, b] },
    });
    await waitFor(() => expect(result.current.spaces).toHaveLength(2));

    rerender({ set: [a, b, c] });
    expect(result.current.spacesById.has(a)).toBe(true);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.spaces).toHaveLength(3));

    expect(requestedBatches()).toEqual([[a, b], [c]]);
  });

  it('asks once for overlapping sets mounted together, and not again for a subset', async () => {
    const [a, b, c] = ids(3);
    const shared = sharedWrapper();
    const { result } = renderHook(() => [useSpacesByIds([a, b]), useSpacesByIds([b, c]), useSpacesByIds([a, b, c])], {
      wrapper: shared,
    });
    await waitFor(() => expect(result.current[2].spaces).toHaveLength(3));

    const later = renderHook(() => useSpacesByIds([c, a]), { wrapper: shared });
    expect(later.result.current.spaces.map(space => space.id)).toEqual([c, a]);
    expect(requestedBatches()).toEqual([[a, b, c]]);
  });

  it('asks again on the next mount for a space it could not find', async () => {
    const [a] = ids(1);
    mocks.getSpaces.mockImplementationOnce(() => Effect.succeed([]));
    const shared = sharedWrapper();
    const first = renderHook(() => useSpacesByIds([a]), { wrapper: shared });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.spaces).toHaveLength(0);
    first.unmount();

    const second = renderHook(() => useSpacesByIds([a]), { wrapper: shared });
    await waitFor(() => expect(second.result.current.spaces).toHaveLength(1));
    expect(requestedBatches()).toEqual([[a], [a]]);
  });

  it('keeps its result identity across renders that ask for the same ids', async () => {
    const { result, rerender } = renderHook(() => useSpacesByIds(ids(2)), { wrapper });
    await waitFor(() => expect(result.current.spaces).toHaveLength(2));
    const before = result.current;

    rerender();
    expect(result.current.spacesById).toBe(before.spacesById);
  });
});
