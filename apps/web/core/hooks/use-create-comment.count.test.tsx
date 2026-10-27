import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type * as React from 'react';

import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commentsFetchedQueryKey } from '~/core/io/query-keys';

import type { CommentEntity } from '~/partials/comments/types';

import { resetCommentCountSeeds, useCommentCount } from './use-comment-count';
import { useCreateComment } from './use-create-comment';

const TARGET = 'a3f1c2d4e5b6478899aabbccddeeff00';
const COMMENT = 'b3f1c2d4e5b6478899aabbccddeeff00';
const SPACE = 'c3f1c2d4e5b6478899aabbccddeeff00';
const mocks = vi.hoisted(() => ({
  checkEntityExists: vi.fn(),
  fetchComments: vi.fn(),
  sendUserOperation: vi.fn(),
  publishEdit: vi.fn(),
}));

vi.mock('./cached-write-identity', () => ({
  readCachedSmartAccount: () => ({
    account: { address: '0xabc' },
    sendUserOperation: mocks.sendUserOperation,
  }),
  readCachedPersonalSpace: () => ({ personalSpaceId: SPACE }),
}));
vi.mock('./use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: null }) }));
vi.mock('./use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: SPACE }) }));
vi.mock('./use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('./use-toast', () => ({ useToast: () => [null, vi.fn()] }));
vi.mock('~/core/state/status-bar-store', () => ({ useReportError: () => vi.fn() }));
vi.mock('~/core/sdk/geo-client', () => ({
  geo: { personalSpaces: { publishEdit: mocks.publishEdit } },
}));
vi.mock('~/core/io/queries', () => ({ checkEntityExists: mocks.checkEntityExists }));
vi.mock('./use-comments', async importOriginal => ({
  ...(await importOriginal<typeof import('./use-comments')>()),
  fetchCommentEntitiesForTarget: mocks.fetchComments,
}));

function comment(id: string): CommentEntity {
  return {
    id,
    name: 'A reason',
    markdownContent: 'A reason',
    targetEntityId: TARGET,
    targetSpaceId: SPACE,
    replyToCommentId: null,
    replyToCommentSpaceId: null,
    author: { spaceId: SPACE, address: '0xabc', name: null, avatarUrl: null },
    createdAt: '2026-10-26T00:00:00Z',
    spaceId: SPACE,
    resolved: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.clearAllMocks();
  resetCommentCountSeeds();
  mocks.publishEdit.mockResolvedValue({ to: '0xabc', calldata: '0x' });
  mocks.sendUserOperation.mockResolvedValue('0x123');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe.each([
  { sync: 'indexed probe', probeResult: true, syncAfterMs: 1_500 },
  { sync: 'fallback after exhausted probes', probeResult: false, syncAfterMs: 91_501 },
])('comment count after publishing without opening the thread ($sync)', ({ probeResult, syncAfterMs }) => {
  it.each([
    { label: 'first comment', seed: 0, existing: 0, commentsInSeed: undefined },
    { label: 'existing comments', seed: 5, existing: 5, commentsInSeed: undefined },
    { label: 'claim activity', seed: 33, existing: 1, commentsInSeed: 1 },
  ])('keeps the increment after indexing: $label', async ({ seed, existing, commentsInSeed }) => {
    mocks.checkEntityExists.mockReturnValue(Effect.succeed(probeResult));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const serverRows = [...Array.from({ length: existing }, (_, i) => comment(`existing-${i}`)), comment(COMMENT)];
    mocks.fetchComments.mockResolvedValue(serverRows);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => ({
        ...useCreateComment(TARGET),
        count: useCommentCount(TARGET, seed, { commentsInSeed }),
      }),
      { wrapper }
    );
    expect(result.current.count).toBe(seed);

    vi.setSystemTime(2_000);
    await act(async () => {
      const published = await result.current.createComment({
        text: 'A reason',
        targetSpaceId: SPACE,
        commentId: COMMENT,
      });
      expect(published).toEqual({ id: COMMENT, published: true });
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.count).toBe(seed + 1);
    expect(client.getQueryData(commentsFetchedQueryKey(TARGET))).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(syncAfterMs));

    // The poll replaces the pending row with indexed rows. The count must now use the fetched
    // list instead of falling back to the original seed when the pending flag disappears.
    expect(mocks.fetchComments).toHaveBeenCalledOnce();
    expect(client.getQueryData(['comments', TARGET])).toEqual(serverRows);
    expect(result.current.count).toBe(seed + 1);
    expect(client.getQueryData(commentsFetchedQueryKey(TARGET))).toBe(true);
  });
});
