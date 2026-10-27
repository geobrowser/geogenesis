import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type * as React from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommentEntity } from '~/partials/comments/types';

// Signed in, with no personal space yet: `createComment` inserts its optimistic row and then returns
// `{ published: false }` before any transaction — the retained path, and the only one this file is
// about. Nothing here reaches the chain.
vi.mock('./cached-write-identity', () => ({
  readCachedSmartAccount: () => ({ account: { address: '0xabc' } }),
  readCachedPersonalSpace: () => ({ personalSpaceId: null }),
}));
vi.mock('./use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('./use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('./use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('./use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => vi.fn() }));

const { useCreateComment } = await import('./use-create-comment');

const TARGET = 'debate-1';
const key = ['comments', TARGET];

function setup(cached: CommentEntity[] | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cached) client.setQueryData(key, cached);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCreateComment(TARGET), { wrapper });
  return { client, createComment: result.current.createComment };
}

function rowsIn(client: QueryClient) {
  return (client.getQueryData<CommentEntity[]>(key) ?? []).map(comment => comment.id);
}

/**
 * A retry passes the id it was given. It used to skip inserting a row on the assumption that its row
 * was still in the cache — which is not so after an earlier attempt failed, because the failure path
 * filters that row out. So a retry that then succeeded published a comment the thread did not show,
 * while the Activity heading counted it back in.
 */
describe('useCreateComment retrying a comment by id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('puts the row back when an earlier failure took it out, and reports it', async () => {
    const { client, createComment } = setup([]);
    const onOptimistic = vi.fn();

    await act(() =>
      createComment({ text: 'Back again', targetSpaceId: 'space-1', commentId: 'comment-1', onOptimistic })
    );

    expect(rowsIn(client)).toEqual(['comment-1']);
    expect(onOptimistic).toHaveBeenCalledWith('comment-1');
  });

  // The ordinary retry, for a publish that was retained rather than failed: its row never left, so it
  // is neither duplicated nor counted a second time.
  it('leaves a row that is still there alone, and does not report it again', async () => {
    const existing = { id: 'comment-1', createdAt: '2026-09-26T10:00:00Z', isPendingPublish: true } as CommentEntity;
    const { client, createComment } = setup([existing]);
    const onOptimistic = vi.fn();

    await act(() =>
      createComment({ text: 'Still here', targetSpaceId: 'space-1', commentId: 'comment-1', onOptimistic })
    );

    expect(rowsIn(client)).toEqual(['comment-1']);
    expect(onOptimistic).not.toHaveBeenCalled();
  });

  it('inserts and reports a first attempt as it always has', async () => {
    const { client, createComment } = setup(undefined);
    const onOptimistic = vi.fn();

    await act(() => createComment({ text: 'First', targetSpaceId: 'space-1', onOptimistic }));

    expect(rowsIn(client)).toHaveLength(1);
    expect(onOptimistic).toHaveBeenCalledOnce();
  });
});
