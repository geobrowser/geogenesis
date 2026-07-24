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
    staleTime: 60_000,
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
