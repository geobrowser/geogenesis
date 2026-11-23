import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveGraphFilter } from './graph-filter';
import { GRAPH_HOP_PREFETCH_DELAY_MS, usePrefetchGraphHop } from './use-graph-explorer';

const fetchGraphHop = vi.hoisted(() => vi.fn(async () => ({ centre: null, relations: [], truncated: false })));
vi.mock('./fetch-graph-hop', () => ({ fetchGraphHop }));
vi.mock('~/core/debates/use-claim-space-allowlist', () => ({ useClaimSpaceAllowlist: () => ({ allowlist: [] }) }));
vi.mock('~/core/topics/use-topic-space-scope', () => ({ useTopicSpaceScope: () => undefined }));

const filter = resolveGraphFilter({ spaceIds: null, topicId: null, topicSpaceId: null });
const id = (n: number) => n.toString(16).padStart(32, '0');

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePrefetchGraphHop(filter), { wrapper });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('usePrefetchGraphHop', () => {
  it('fetches nothing while the pointer sweeps across nodes', () => {
    const { result } = setup();
    act(() => {
      for (let n = 1; n <= 8; n++) {
        result.current(id(n));
        vi.advanceTimersByTime(GRAPH_HOP_PREFETCH_DELAY_MS / 3);
      }
      result.current(null);
      vi.advanceTimersByTime(GRAPH_HOP_PREFETCH_DELAY_MS * 2);
    });
    expect(fetchGraphHop).not.toHaveBeenCalled();
  });

  it('warms a node held for the delay', () => {
    const { result } = setup();
    act(() => {
      result.current(id(1));
      vi.advanceTimersByTime(GRAPH_HOP_PREFETCH_DELAY_MS);
    });
    expect(fetchGraphHop).toHaveBeenCalledTimes(1);
    expect(fetchGraphHop).toHaveBeenCalledWith(id(1), filter, expect.anything());
  });
});
