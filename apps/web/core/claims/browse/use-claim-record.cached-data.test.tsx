import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useClaimRecord } from './use-claim-record';

const claimEntity = {
  id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  rankingScore: 4,
  updatedAt: '2026-01-01T00:00:00Z',
};
const claimRow = { entityId: claimEntity.id, spaceId: 'space-1' };

const mocks = vi.hoisted(() => ({
  countLoading: true,
  claimsError: false,
  useQuery: vi.fn(),
  useInfiniteQuery: vi.fn(),
  buildExploreFeedRows: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: mocks.useQuery,
  useInfiniteQuery: mocks.useInfiniteQuery,
}));
vi.mock('~/core/explore/explore-card-item', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/explore/explore-card-item')>()),
  buildExploreFeedRows: mocks.buildExploreFeedRows,
}));

const emptyConnection = { entities: [], endCursor: null, hasNextPage: false };

describe('useClaimRecord independent loading and cached data', () => {
  beforeEach(() => {
    mocks.countLoading = true;
    mocks.claimsError = false;
    mocks.useQuery.mockReset();
    mocks.useInfiniteQuery.mockReset();
    mocks.buildExploreFeedRows.mockReset();

    mocks.useQuery.mockImplementation(() => ({
      data: undefined,
      isLoading: mocks.countLoading,
      isError: false,
      error: null,
    }));
    mocks.useInfiniteQuery.mockImplementation(() => {
      const call = mocks.useInfiniteQuery.mock.calls.length;
      if (call === 1) {
        return {
          data: {
            pages: [
              {
                topicClaims: { entities: [claimEntity], endCursor: null, hasNextPage: false },
                extractedClaims: emptyConnection,
              },
            ],
          },
          isLoading: false,
          isError: mocks.claimsError,
          isFetchingNextPage: false,
          hasNextPage: false,
          fetchNextPage: vi.fn(),
          refetch: vi.fn(),
        };
      }

      return {
        data: undefined,
        isLoading: true,
        isError: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        refetch: vi.fn(),
      };
    });
    mocks.buildExploreFeedRows.mockImplementation((entities: Array<{ id: string }>) =>
      entities.map(entity => ({ ...claimRow, entityId: entity.id }))
    );

  });

  it('publishes claim rows before the independent exact count and debate requests finish', () => {
    const { result } = renderHook(() =>
      useClaimRecord({ claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1', topicIds: ['topic-1'] })
    );

    expect(result.current.claimRows).toEqual([claimRow]);
    expect(result.current.claimsLoading).toBe(false);
    expect(result.current.claimsTotal).toBe(1);
    expect(result.current.debatesLoading).toBe(true);
  });

  it('keeps cached claim cards visible when their background page refresh fails', () => {
    mocks.claimsError = true;

    const { result } = renderHook(() =>
      useClaimRecord({ claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1', topicIds: ['topic-1'] })
    );

    expect(result.current.claimRows).toEqual([claimRow]);
    expect(result.current.claimsError).toBe(true);
  });
});
