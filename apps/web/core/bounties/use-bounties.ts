'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { CURRENT_BOUNTY_SPACE_IDS } from './constants';
import { type BoardData, fetchBoardBounties } from './fetch-bounties';

export const bountyQueryKeys = {
  all: ['bounties'] as const,
  board: (spaceIds: readonly string[]) => ['bounties', 'board', [...spaceIds].sort().join(',')] as const,
};

/**
 * Board data for a set of spaces (defaults to the participating-space
 * allow-list). Filtering/sorting happens client-side over this one dataset,
 * so filter changes never refetch.
 */
export function useBoardBounties(spaceIds: readonly string[] = CURRENT_BOUNTY_SPACE_IDS, enabled = true) {
  return useQuery<BoardData>({
    queryKey: bountyQueryKeys.board(spaceIds),
    enabled: enabled && spaceIds.length > 0,
    staleTime: 30_000,
    queryFn: () => Effect.runPromise(fetchBoardBounties(spaceIds)),
  });
}

/** When to refetch after a bounty publish: the indexer lags it by a few seconds. */
const INDEXER_REFETCH_DELAYS_MS = [3_000, 7_000, 12_000];

/**
 * Re-runs `invalidate` on a short schedule after a publish. One immediate
 * refetch usually beats the indexer and misses the new row.
 */
export function useInvalidateSoon(invalidate: () => unknown) {
  return React.useCallback(() => {
    for (const delay of INDEXER_REFETCH_DELAYS_MS) window.setTimeout(() => void invalidate(), delay);
  }, [invalidate]);
}
