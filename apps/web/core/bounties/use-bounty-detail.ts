'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { type BountyDetail, fetchBountyDetail } from './fetch-bounty-detail';
import { bountyQueryKeys } from './use-bounties';

export const bountyDetailQueryKey = (spaceId: string, bountyId: string) =>
  [...bountyQueryKeys.all, 'detail', spaceId, bountyId] as const;

export function useBountyDetail(spaceId: string, bountyId: string, enabled = true) {
  return useQuery<BountyDetail | null>({
    queryKey: bountyDetailQueryKey(spaceId, bountyId),
    enabled,
    staleTime: 15_000,
    queryFn: () => Effect.runPromise(fetchBountyDetail(spaceId, bountyId)),
  });
}
