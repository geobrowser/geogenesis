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
   * `isPendingPublish` does not mean the server lacks the row — it means "keep this row through
   * refetches", and it stays set after publishing until the indexer returns the comment. So a server
   * count rendered *after* the flagged row was written may already include it, and adding the row to
   * that count would report the same comment twice.
   */
  it('does not add a still-flagged row to a server count that already includes it', () => {
    // Five from the server plus one that published but has not come back from the indexer yet.
    client.setQueryData<CommentEntity[]>(
      ['comments', ENTITY_ID],
      [
        comment('1'),
        comment('2'),
        comment('3'),
        comment('4'),
        comment('5'),
        comment('new', { isPendingPublish: true } as Partial<CommentEntity>),
      ]
    );

    // A later navigation renders six — the indexer has caught up, even though the row is still flagged.
    vi.setSystemTime(90_000);
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 6), { wrapper });

    expect(result.current).toBe(6);
  });

  /**
   * This hook is rendered on surfaces that swap which entity they are about without remounting, and
   * two entities can easily have the same number of comments — so a seed keyed on the count alone
   * would keep the previous entity's timestamp, and a stale list for the new entity could look newer
   * than it and outrank a freshly rendered count.
   */
  it('re-seeds when the entity changes, even at an identical server count', async () => {
    vi.setSystemTime(2_000);
    const { result, rerender } = renderHook((props: { entityId: string }) => useCommentCount(props.entityId, 4), {
      wrapper,
      initialProps: { entityId: ENTITY_ID },
    });

    // This entity's own list is written after its seed, so it legitimately wins.
    vi.setSystemTime(3_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], [comment('a')]);
      // And a list for the entity we are about to switch to, written at the same moment: newer than
      // the seed taken above, which is the seed a count-keyed hook would still be holding.
      client.setQueryData<CommentEntity[]>(['comments', 'other-entity'], [comment('1'), comment('2'), comment('3')]);
    });
    await waitFor(() => expect(result.current).toBe(1));

    // Same server count, different entity. That list predates *this* render, so the freshly rendered
    // count wins — but only if switching entities took a new seed.
    vi.setSystemTime(90_000);
    rerender({ entityId: 'other-entity' });

    expect(result.current).toBe(4);
  });

  /**
   * `useCreateComment` seeds this entry with `(old = [])`, so posting before the list has loaded — or
   * after that query failed — leaves the cache holding nothing but the new comment. Its length is then
   * a count of one, and the server's five is the better half of the answer.
   */
  /**
   * The list filters what the count merely counted — the count is backlink ids, the list drops any
   * whose relations do not come back — so an empty list beside a count of five is a real answer, not a
   * cache that has not loaded. A pill saying five next to a visibly empty panel is the worse wrong.
   */
  it('reports zero when the list answers empty, even against a nonzero server count', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(['comments', ENTITY_ID], []);
    });

    await waitFor(() => expect(result.current).toBe(0));
  });

  it('adds a pending row to the server count when the cache holds only that row', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    // Posted after the count was rendered, with the list never having loaded.
    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(
        ['comments', ENTITY_ID],
        [comment('new', { isPendingPublish: true } as Partial<CommentEntity>)]
      );
    });

    await waitFor(() => expect(result.current).toBe(6));
  });

  /**
   * The other half of the pair. Here the cache is the fuller record: the server count was rendered at
   * one, the list then loaded and found two already indexed, and the reader has since added a third.
   * `serverCount + pending` would say two and undercount what is plainly on screen.
   */
  it('keeps the cache length when it is ahead of the server count and a row is pending', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 1), { wrapper });

    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(
        ['comments', ENTITY_ID],
        [comment('1'), comment('2'), comment('new', { isPendingPublish: true } as Partial<CommentEntity>)]
      );
    });

    await waitFor(() => expect(result.current).toBe(3));
  });

  it('counts two pending rows over a partial cache', async () => {
    const { result } = renderHook(() => useCommentCount(ENTITY_ID, 5), { wrapper });

    vi.setSystemTime(2_000);
    act(() => {
      client.setQueryData<CommentEntity[]>(
        ['comments', ENTITY_ID],
        [
          comment('new-1', { isPendingPublish: true } as Partial<CommentEntity>),
          comment('new-2', { isPendingPublish: true } as Partial<CommentEntity>),
        ]
      );
    });

    await waitFor(() => expect(result.current).toBe(7));
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
