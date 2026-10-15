import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSpaceDebateSupport } from './space-debate-support';

const DAO = '224406e0de3c48d78ef12774111b8b2f';
const PERSONAL = '73a82967cb12f604f9589ac4bc8024cb';
const UNKNOWN = '00000000000000000000000000000000';

const fetchSpaceTypes = vi.hoisted(() =>
  vi.fn(async (ids: string[]) => {
    const known: Record<string, string> = {
      '224406e0de3c48d78ef12774111b8b2f': 'DAO',
      '73a82967cb12f604f9589ac4bc8024cb': 'PERSONAL',
    };
    return new Map(ids.filter(id => known[id]).map(id => [id, known[id]]));
  })
);
vi.mock('~/core/io/subgraph/fetch-personal-space-ids', () => ({ fetchSpaceTypes }));

afterEach(() => {
  fetchSpaceTypes.mockClear();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe('useSpaceDebateSupport', () => {
  it('holds as unknown, then answers each space from one batched type lookup', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(
      () => [useSpaceDebateSupport(DAO), useSpaceDebateSupport(PERSONAL), useSpaceDebateSupport(UNKNOWN)],
      { wrapper }
    );

    expect(result.current).toEqual(['unknown', 'unknown', 'unknown']);
    await waitFor(() => expect(result.current).toEqual(['indexed', 'not-indexed', 'not-indexed']));
    expect(fetchSpaceTypes).toHaveBeenCalledTimes(1);
    expect(fetchSpaceTypes).toHaveBeenCalledWith([DAO, PERSONAL, UNKNOWN]);
  });

  it('answers from a full space already in the cache without a request', () => {
    const { client, wrapper } = setup();
    client.setQueryData(['space', DAO], { id: DAO, type: 'DAO' });

    const { result } = renderHook(() => useSpaceDebateSupport(DAO), { wrapper });

    expect(result.current).toBe('indexed');
    expect(fetchSpaceTypes).not.toHaveBeenCalled();
  });

  it('settles as not indexed when the lookup fails', async () => {
    fetchSpaceTypes.mockRejectedValueOnce(new Error('down'));
    const { wrapper } = setup();

    const { result } = renderHook(() => useSpaceDebateSupport(DAO), { wrapper });

    await waitFor(() => expect(result.current).toBe('not-indexed'));
  });
});
