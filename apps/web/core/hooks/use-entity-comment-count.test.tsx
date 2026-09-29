import { renderHook } from '@testing-library/react';

import * as Effect from 'effect/Effect';
import { describe, expect, it, vi } from 'vitest';

import { useEntityCommentCount } from './use-entity-comment-count';

const mocks = vi.hoisted(() => ({
  queryOptions: null as Record<string, unknown> | null,
  getCount: vi.fn(),
  liveCount: vi.fn((_: string, serverCount: number) => serverCount + 1),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: Record<string, unknown>) => {
    mocks.queryOptions = options;
    return { data: 6, isLoading: false };
  },
}));

vi.mock('~/core/io/queries', () => ({
  getEntityCommentCount: (...args: unknown[]) => mocks.getCount(...args),
}));

vi.mock('./use-comment-count', () => ({
  useCommentCount: (entityId: string, serverCount: number) => mocks.liveCount(entityId, serverCount),
}));

describe('useEntityCommentCount', () => {
  it('loads the lightweight count and layers live comment updates over it', async () => {
    mocks.getCount.mockReturnValue(Effect.succeed(6));

    const { result } = renderHook(() => useEntityCommentCount('topic-1'));

    expect(result.current).toEqual({ count: 7, isLoading: false });
    expect(mocks.queryOptions?.queryKey).toEqual(['entity-comment-count', 'topic-1']);
    expect(mocks.liveCount).toHaveBeenCalledWith('topic-1', 6);

    const signal = new AbortController().signal;
    const queryFn = mocks.queryOptions?.queryFn as (args: { signal: AbortSignal }) => Promise<number>;
    await expect(queryFn({ signal })).resolves.toBe(6);
    expect(mocks.getCount).toHaveBeenCalledWith('topic-1', signal);
  });
});
