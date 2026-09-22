import { act, renderHook } from '@testing-library/react';

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
  claimData: undefined as Record<string, unknown> | undefined,
  claimsHasNextPage: false,
  claimFetchNextPage: vi.fn(),
  allowedSets: [] as Set<string>[],
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
    mocks.claimFetchNextPage.mockReset();
    mocks.allowedSets = [];
    mocks.claimsHasNextPage = false;
    mocks.claimFetchNextPage.mockResolvedValue({ isError: false });
    mocks.claimData = {
      pages: [
        {
          topicClaims: { entities: [claimEntity], endCursor: null, hasNextPage: false },
          extractedClaims: emptyConnection,
        },
      ],
    };

    mocks.useQuery.mockImplementation(() => ({
      data: undefined,
      isLoading: mocks.countLoading,
      isError: false,
      error: null,
    }));
    mocks.useInfiniteQuery.mockImplementation((options: { queryKey: string[] }) => {
      if (options.queryKey[1] === 'claims') {
        return {
          data: mocks.claimData,
          isLoading: false,
          isError: mocks.claimsError,
          isFetchingNextPage: false,
          hasNextPage: mocks.claimsHasNextPage,
          fetchNextPage: mocks.claimFetchNextPage,
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
    mocks.buildExploreFeedRows.mockImplementation((entities: Array<{ id: string }>, allowed: Set<string>) => {
      mocks.allowedSets.push(allowed);
      return entities.map(entity => ({ ...claimRow, entityId: entity.id }));
    });

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

  it('uses each entity’s matching spaces rather than every selected space', () => {
    mocks.claimData = {
      pages: [
        {
          topicClaims: {
            entities: [{ ...claimEntity, matchingSpaceIds: ['space-2'] }],
            endCursor: null,
            hasNextPage: false,
          },
          extractedClaims: emptyConnection,
        },
      ],
    };

    renderHook(() =>
      useClaimRecord({
        claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        spaceId: 'space-1',
        spaceIds: ['space-1', 'space-2'],
        topicIds: ['topic-1'],
      })
    );

    expect([...mocks.allowedSets[0]]).toEqual(['space2']);
  });

  it('fetches every open union branch before revealing the next ranked slice', async () => {
    let resolveNextPage!: (value: { isError: boolean }) => void;
    mocks.claimFetchNextPage.mockReturnValue(
      new Promise<{ isError: boolean }>(resolve => {
        resolveNextPage = resolve;
      })
    );
    mocks.claimsHasNextPage = true;
    const entities = Array.from({ length: 40 }, (_, index) => ({
      ...claimEntity,
      id: `${index + 1}`.padStart(32, '0'),
      rankingScore: 40 - index,
    }));
    mocks.claimData = {
      pages: [
        {
          topicClaims: { entities: entities.slice(0, 20), endCursor: 'topic-next', hasNextPage: true },
          extractedClaims: { entities: entities.slice(20), endCursor: 'extracted-next', hasNextPage: true },
        },
      ],
    };

    const { result } = renderHook(() =>
      useClaimRecord({ claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1', topicIds: ['topic-1'] })
    );
    expect(result.current.claimRows).toHaveLength(20);

    act(() => result.current.fetchNextClaimsPage());
    expect(mocks.claimFetchNextPage).toHaveBeenCalledOnce();
    expect(result.current.claimRows).toHaveLength(20);

    await act(async () => resolveNextPage({ isError: false }));
    expect(result.current.claimRows).toHaveLength(40);
  });
});
