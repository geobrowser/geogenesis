import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { beforeEach, describe, expect, it } from 'vitest';

import type { CommentEntity } from '~/partials/comments/types';

import { useCommentCount } from './use-comment-count';

const ENTITY_ID = 'a3f1c2d4e5b6478899aabbccddeeff00';

let client: QueryClient;

function comment(id: string): CommentEntity {
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
  } as CommentEntity;
}

function wrapper({ children }: { children: React.ReactNode }) {
  // The client is built outside the render body on purpose: a fresh one per render would drop the
  // cache writes these tests make, and the hook would look correct for the wrong reason.
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('useCommentCount', () => {
  it('reports the server count while the client has no list', () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    expect(result.current).toBe(5);
  });

  it('follows the list once something has read it', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1'), comment('2'), comment('3')]);
    });

    await waitFor(() => expect(result.current).toBe(3));
  });

  it('follows a comment being added, which is the whole point', async () => {
    client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('1')]);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 1), { wrapper });

    expect(result.current).toBe(1);

    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], (old = []) => [...old, comment('2')]);
    });

    await waitFor(() => expect(result.current).toBe(2));
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

  it("reads per entity, so one entity's comments do not count for another", async () => {
    client.setQueryData<CommentEntity[]>(['comments', 'other-entity'], [comment('1'), comment('2')]);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 0), { wrapper });

    expect(result.current).toBe(0);
  });
});
