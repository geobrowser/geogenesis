import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { useClaimRecord } from './use-claim-record';

const relatedClaim = {
  id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'Related claim',
  description: null,
  spaces: ['space-1'],
  types: [],
  relations: [],
  values: [],
} as Entity;

const relatedRow = { entityId: relatedClaim.id, spaceId: 'space-1' };

const mocks = vi.hoisted(() => ({
  discoveryError: false,
  scoreError: false,
  useQueryAllEntities: vi.fn(),
  useEntityScores: vi.fn(),
  useClaimExploreRows: vi.fn(),
}));

vi.mock('~/core/sync/use-store', () => ({ useQueryAllEntities: mocks.useQueryAllEntities }));
vi.mock('~/core/profile/use-entity-scores', () => ({ useEntityScores: mocks.useEntityScores }));
vi.mock('./use-claim-explore-rows', () => ({
  CLAIM_RECORD_PAGE_SIZE: 20,
  useClaimExploreRows: mocks.useClaimExploreRows,
}));

function queryResult(entities: Entity[] = [], error: Error | null = null) {
  return {
    entities,
    isLoading: false,
    isFetching: false,
    isFetched: true,
    dataAvailable: true,
    error,
    refetch: vi.fn(async () => undefined),
  };
}

describe('useClaimRecord cached refresh failures', () => {
  beforeEach(() => {
    mocks.discoveryError = false;
    mocks.scoreError = false;
    mocks.useQueryAllEntities.mockReset();
    mocks.useEntityScores.mockReset();
    mocks.useClaimExploreRows.mockReset();

    mocks.useQueryAllEntities.mockImplementation(() => {
      const call = mocks.useQueryAllEntities.mock.calls.length;
      if (call === 1) {
        return queryResult(
          [relatedClaim],
          mocks.discoveryError ? new Error('topic refresh failed') : null
        );
      }
      return queryResult();
    });
    mocks.useEntityScores.mockImplementation(() => ({
      scores: new Map(),
      rankings: new Map([[relatedClaim.id, 1]]),
      dataAvailable: true,
      isLoading: false,
      isError: mocks.scoreError,
      isFetching: false,
      refetch: vi.fn(),
    }));
    mocks.useClaimExploreRows.mockImplementation((ids: string[]) => ({
      data: ids.includes(relatedClaim.id) ? [relatedRow] : [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    }));
  });

  it('keeps cached cards visible when discovery refresh fails', () => {
    mocks.discoveryError = true;

    const { result } = renderHook(() =>
      useClaimRecord({ claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1', topicIds: ['topic-1'] })
    );

    expect(result.current.claimRows).toEqual([relatedRow]);
    expect(result.current.claimsError).toBe(true);
  });

  it('keeps cached cards visible when Best-score refresh fails', () => {
    mocks.scoreError = true;

    const { result } = renderHook(() =>
      useClaimRecord({ claimId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spaceId: 'space-1', topicIds: ['topic-1'] })
    );

    expect(result.current.claimRows).toEqual([relatedRow]);
    expect(result.current.claimsError).toBe(true);
  });
});
