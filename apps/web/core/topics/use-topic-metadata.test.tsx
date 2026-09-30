import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normId } from '~/core/utils/norm-id';

import { useTopicMetadata } from './use-topic-metadata';

const mocks = vi.hoisted(() => ({ fetchTopicMetadata: vi.fn() }));

vi.mock('~/core/io/subgraph/fetch-topic-metadata', () => ({ fetchTopicMetadata: mocks.fetchTopicMetadata }));

const TOPIC = '2222222222222222222222222222222a';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function meta(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Mental health',
    description: null,
    image: 'ipfs://image',
    spaces: [{ id: 's' }],
    spacesCount: 1,
    ...overrides,
  };
}

describe('useTopicMetadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not fetch for an empty id list', () => {
    const { result } = renderHook(() => useTopicMetadata([]), { wrapper: wrapper() });

    expect(mocks.fetchTopicMetadata).not.toHaveBeenCalled();
    expect(result.current.metadata.size).toBe(0);
  });

  it('resolves names and images keyed by the normalized topic id', async () => {
    mocks.fetchTopicMetadata.mockResolvedValue(new Map([[TOPIC, meta()]]));

    const { result } = renderHook(() => useTopicMetadata([TOPIC]), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.metadata.size).toBe(1));
    // Looked up by the normalized id every follow consumer already holds, whatever the graph returned.
    expect(result.current.metadata.get(normId(TOPIC))?.name).toBe('Mental health');
    expect(result.current.metadata.get(normId(TOPIC))?.image).toBe('ipfs://image');
  });
});
