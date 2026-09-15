import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommentEntity } from '~/partials/comments/types';

import { useCommentCount } from './use-comment-count';

const ENTITY_ID = 'a3f1c2d4e5b6478899aabbccddeeff00';

let client: QueryClient;

function comment(id: string, overrides: Partial<CommentEntity> = {}): CommentEntity {
  return {
    id,
    name: null,
    markdownContent: 'hi',
    targetEntityId: ENTITY_ID,
    targetSpaceId: 'space',
    replyToCommentId: null,
    replyToCommentSpaceId: null,
    author: { spaceId: 'author', address: 'author', name: null, avatarUrl: null },
    createdAt: new Date().toISOString(),
    spaceId: 'author',
    resolved: false,
    ...overrides,
  } as CommentEntity;
}

function wrapper({ children }: { children: React.ReactNode }) {
  // The client is built outside the render body on purpose: a fresh one per render would drop the
  // cache writes these tests make, and the hook would look correct for the wrong reason.
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The hook compares when the cache was written against when the server count arrived, so the clock
  // is driven explicitly rather than left to land two writes in the same millisecond.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(1_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCommentCount', () => {
  it('reports the server count while the client has no list', () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    expect(result.current).toBe(5);
  });

  it('follows the list once something has read it', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1'), comment('2'), comment('3')]);
    });

    await waitFor(() => expect(result.current).toBe(3));
  });

  it('follows a comment being added, which is the whole point', async () => {
    client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1')]);
    vi.setSystemTime(2_000);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 1), { wrapper });

    expect(result.current).toBe(1);

    vi.setSystemTime(3_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], (old = []) => [...old, comment('2')]);
    });

    await waitFor(() => expect(result.current).toBe(2));
  });

  /**
   * This hook subscribes, so the entry is never collected while a surface showing a count stays
   * mounted, and nothing here refetches it. A leftover list that outranked the server would therefore
   * keep the count behind for as long as that surface lived.
   */
  it('prefers a freshly rendered server count over a list left from an earlier visit', () => {
    client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1'), comment('2')]);

    vi.setSystemTime(60_000);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 7), { wrapper });

    expect(result.current).toBe(7);
  });

  it('re-seeds when a new server count arrives, so the old cache stops winning', async () => {
    const { result, rerender } = renderHook(
      (props: { serverCount: number }) => useCommentCount(ENTITY_ID, props.serverCount),
      {
        wrapper,
        initialProps: { serverCount: 2 },
      }
    );

    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1'), comment('2')]);
    });
    await waitFor(() => expect(result.current).toBe(2));

    // A later navigation renders a fresher count; the cache has not been touched since.
    vi.setSystemTime(90_000);
    rerender({ serverCount: 9 });

    expect(result.current).toBe(9);
  });

  /**
   * A row mid-publish is knowledge the server cannot have — the indexer is behind by design — so the
   * count must not drop back to a server number that predates it.
   */
  it('keeps a list holding unpublished rows even when the server count is newer', () => {
    client.setQueryData<CommentEntity[]>(
      ['comments', ENTITY_ID],
      [comment('1'), comment('2', { isPendingPublish: true } as Partial<CommentEntity>)]
    );

    vi.setSystemTime(90_000);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 1), { wrapper });

    expect(result.current).toBe(2);
  });

  it('never fetches — no queryFn is configured, so an enabled query would throw', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 2), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    // A missing queryFn surfaces as an error state the moment react-query tries to run one.
    expect(client.getQueryState(['comments', ENTITY_ID])?.status).not.toBe('error');
    expect(client.getQueryState(['comments', ENTITY_ID])?.fetchStatus ?? 'idle').toBe('idle');
    expect(result.current).toBe(2);
  });

  it("reads per entity, so one entity's comments do not count for another", () => {
    client.setQueryData<CommentEntity[]>(['comments', 'other-entity'], [comment('1'), comment('2')]);
    vi.setSystemTime(2_000);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 0), { wrapper });

    expect(result.current).toBe(0);
  });
});
