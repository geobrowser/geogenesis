'use client';

import { type UseQueryResult, useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { profileBySpaceIdQueryKey } from '~/core/io/query-keys';
import { loadProfileBySpaceId } from '~/core/io/subgraph/profile-batch-loader';
import type { Profile } from '~/core/types';

type UseProfilesBySpaceIdsResult = {
  profilesBySpaceId: Map<string, Profile>;
  isLoading: boolean;
};

/**
 * Resolve profiles for a list of personal-space ids, one cache entry per id.
 *
 * Callers hand us a list that grows and shrinks — a claim's responders, a ranking's
 * submitters — and the ids that were already resolved must keep rendering when one is added.
 * Per-id caching gives that for free, and the requests still leave as a single batch because
 * `loadProfileBySpaceId` coalesces them.
 *
 * `enabled: false` still serves whatever is already cached, which is what the batched claim
 * views rely on: they prime the cache up front and then read it without issuing requests.
 */
export function useProfilesBySpaceIds(spaceIds: string[] = [], enabled = true): UseProfilesBySpaceIdsResult {
  const uniqueSpaceIds = React.useMemo(() => [...new Set(spaceIds.filter(Boolean))], [spaceIds]);

  // Memoized because query-core skips `combine` only while the function itself is unchanged
  // (`combine !== lastCombine`). Rebuilt each render it re-runs every render, and the structural
  // sharing that would otherwise hide that doesn't reach into a Map — so callers got a new
  // `profilesBySpaceId` identity every time, defeating the memos downstream of it.
  const combine = React.useCallback(
    (results: UseQueryResult<Profile>[]) => {
      const profilesBySpaceId = new Map<string, Profile>();

      results.forEach((result, index) => {
        const spaceId = uniqueSpaceIds[index];
        if (spaceId && result.data) profilesBySpaceId.set(spaceId, result.data);
      });

      return { profilesBySpaceId, isLoading: results.some(result => result.isLoading) };
    },
    [uniqueSpaceIds]
  );

  return useQueries({
    queries: uniqueSpaceIds.map(spaceId => ({
      queryKey: profileBySpaceIdQueryKey(spaceId),
      queryFn: () => loadProfileBySpaceId(spaceId),
      enabled,
      staleTime: 60_000,
    })),
    combine,
  });
}
