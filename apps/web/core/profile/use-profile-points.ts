'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchProfilePoints, profilePointsQueryKey } from '~/core/profile/profile-points';
import { IS_TESTNET } from '~/core/sdk/geo-network';
import { useFeatureFlag } from '~/core/state/feature-flags';

/**
 * Whether a profile shows its Points row.
 *
 * Three gates AND together. The `profilePoints` flag, off by default, is the rollout switch.
 * Testnet, because curator-backend only reads the testnet graph: a mainnet space id would resolve
 * to nobody and show a confident `0`. And a personal space, because points belong to people.
 */
export function useProfilePointsEnabled(spaceType: 'DAO' | 'PERSONAL'): boolean {
  const flagEnabled = useFeatureFlag('profilePoints');
  return IS_TESTNET && spaceType === 'PERSONAL' && flagEnabled;
}

/**
 * The person's points total. Held for a minute, like the profile's other counts: it only changes
 * when someone is paid or finishes an onboarding step.
 */
export function useProfilePoints(spaceId: string) {
  const { data, isLoading, isError } = useQuery({
    queryKey: profilePointsQueryKey(spaceId),
    queryFn: ({ signal }) => fetchProfilePoints(spaceId, signal),
    enabled: spaceId !== '',
    staleTime: 60_000,
    retry: 1,
  });

  return { points: data ?? null, isLoading, isError };
}
