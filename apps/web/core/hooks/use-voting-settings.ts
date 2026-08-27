'use client';

import { DaoSpaceAbi } from '@geoprotocol/geo-sdk/abis';
import { useQuery } from '@tanstack/react-query';

import { createPublicClient, http } from 'viem';

import { GEOGENESIS } from '~/core/wallet/geo-chain';

import {
  type RawVotingSettings,
  type VotingSettingsSnapshot,
  rawVotingSettingsToSnapshot,
} from '~/partials/governance/voting-settings';

/**
 * Reads a DAO space's on-chain voting settings and returns a plain snapshot. Used
 * client-side (e.g. to fill in the fast/slow path selector copy on the review screen).
 */
export function useVotingSettings(spaceAddress?: string, enabled = true) {
  const { data, isLoading } = useQuery({
    queryKey: ['voting-settings', spaceAddress?.toLowerCase()],
    enabled: Boolean(spaceAddress) && enabled,
    // Governance settings change out-of-band (a slow-path proposal executes on
    // chain, possibly from another session), and this query key is never
    // invalidated. A plain staleTime would keep serving the old snapshot until
    // it expired, so the review-path selector copy lagged the space's real
    // settings until a hard refresh. Refetch on every mount instead: the cached
    // snapshot still renders instantly (no flash), then updates in the
    // background, so reopening the review/publish flow always reflects the
    // current on-chain settings.
    staleTime: 60_000,
    refetchOnMount: 'always',
    queryFn: async (): Promise<VotingSettingsSnapshot | null> => {
      if (!spaceAddress) return null;

      try {
        const publicClient = createPublicClient({ chain: GEOGENESIS, transport: http() });
        const raw = await publicClient.readContract({
          address: spaceAddress as `0x${string}`,
          abi: DaoSpaceAbi,
          functionName: 'votingSettings',
        });

        return rawVotingSettingsToSnapshot(raw as unknown as RawVotingSettings);
      } catch {
        return null;
      }
    },
  });

  return { votingSettings: data ?? null, isLoading };
}
